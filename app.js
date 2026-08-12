import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, push, onChildAdded } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// ==========================================
// PASTE YOUR FIREBASE CONFIG HERE
const firebaseConfig = {

  apiKey: "AIzaSyAPAEbgizA_47jWEQBx6d4720PLzuvOPbk",

  authDomain: "hyperchat-c8eaa.firebaseapp.com",

  databaseURL: "https://hyperchat-c8eaa-default-rtdb.firebaseio.com",

  projectId: "hyperchat-c8eaa",

  storageBucket: "hyperchat-c8eaa.firebasestorage.app",

  messagingSenderId: "379852906414",

  appId: "1:379852906414:web:d96f83e19d2d7ee304f23f"

};

// ==========================================

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app); 
let currentUser = null;

let currentChatRef = null;
let currentChatUnsubscribe = null;
let chatJoinTime = Date.now(); // Used to filter out historical messages

// Converts millisecond timestamp to "4:15 PM"
function formatTime(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString([], { 
        hour: 'numeric', 
        minute: '2-digit' 
    });
}

// --- BROWSER NOTIFICATION HELPER ---
function requestNotificationPermission() {
    if ("Notification" in window) {
        Notification.requestPermission().then((permission) => {
            console.log("Notification permission status:", permission);
        });
    } else {
        alert("This browser does not support desktop notifications.");
    }
}

function triggerNotification(sender, text, chatTitle) {
    if ("Notification" in window && Notification.permission === "granted") {
        // Plays a notification whether tab is hidden or not during testing
        new Notification(`${sender} (${chatTitle})`, {
            body: text,
            icon: "https://cdn-icons-png.flaticon.com/512/732/732200.png"
        });
    }
}

// --- VOICE CALLING LOGIC (PeerJS) ---
let peer = null;
let currentCall = null;
let localAudioStream = null;

function initVoiceChat() {
    peer = new Peer(currentUser.uid); 
    
    peer.on('open', (id) => {
        document.getElementById('my-peer-id').innerText = id;
    });

    peer.on('call', (call) => {
        navigator.mediaDevices.getUserMedia({ video: false, audio: true })
            .then((stream) => {
                localAudioStream = stream;
                call.answer(stream);
                setupCallUI(call);
            })
            .catch((err) => alert("Microphone access denied."));
    });
}

function setupCallUI(call) {
    currentCall = call;
    document.getElementById('call-status-text').innerHTML = `📞 Call in progress`;
    document.getElementById('hangup-btn').style.display = 'inline-block';

    call.on('stream', (remoteStream) => {
        document.getElementById('remote-audio').srcObject = remoteStream;
    });

    call.on('close', resetCallUI);
}

function resetCallUI() {
    document.getElementById('call-status-text').innerHTML = `Your Voice ID: ${currentUser.uid}`;
    document.getElementById('hangup-btn').style.display = 'none';
    
    if (currentCall) currentCall.close();
    if (localAudioStream) {
        localAudioStream.getTracks().forEach(track => track.stop());
    }
    document.getElementById('remote-audio').srcObject = null;
}

document.getElementById('hangup-btn').addEventListener('click', resetCallUI);


// --- CHAT SWITCHING LOGIC ---
function switchChat(chatPath, chatTitle) {
    document.getElementById('chat-header').innerText = chatTitle;
    document.getElementById('messages').innerHTML = '';
    
    // Reset the join timestamp when switching channels
    chatJoinTime = Date.now();
    
    if (currentChatUnsubscribe) {
        currentChatUnsubscribe(); 
    }
    
    currentChatRef = ref(db, chatPath);
    
    currentChatUnsubscribe = onChildAdded(currentChatRef, (snapshot) => {
        const data = snapshot.val();
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message-block';
        
        // Header for Name + Time
        const headerDiv = document.createElement('div');
        headerDiv.className = 'message-header';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'sender-name';
        nameSpan.innerText = data.name;
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.innerText = formatTime(data.timestamp);
        
        headerDiv.appendChild(nameSpan);
        headerDiv.appendChild(timeSpan);
        
        // Message Text
        const textSpan = document.createElement('span');
        textSpan.innerText = data.text;
        
        msgDiv.appendChild(headerDiv);
        msgDiv.appendChild(textSpan);
        
        document.getElementById('messages').appendChild(msgDiv);
        document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
    }, (error) => {
        alert("Firebase Read Error: " + error.message);
    });
}

document.getElementById('general-channel-btn').addEventListener('click', () => {
    switchChat('channels/general', '# general');
});


// --- AUTH & FRIENDS LOGIC ---
const authScreen = document.getElementById('auth-screen');
const appContainer = document.getElementById('app-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        authScreen.style.display = 'none';
        appContainer.style.display = window.innerWidth <= 768 ? 'flex' : 'flex';
        
        messageInput.disabled = false;
        sendBtn.disabled = false;
        document.getElementById('current-username').innerText = user.displayName || user.email.split('@')[0];

        // Request browser notification permission on sign-in
        requestNotificationPermission();

        if(!peer) initVoiceChat(); 
        
        switchChat('channels/general', '# general');
        
        // Load friends list
        document.getElementById('friends-list').innerHTML = '';
        const myFriendsRef = ref(db, 'users/' + user.uid + '/friends');
        
        onChildAdded(myFriendsRef, (snapshot) => {
            const friend = snapshot.val();
            
            const div = document.createElement('div');
            div.className = 'friend-item';
            
            const nameSpan = document.createElement('span');
            nameSpan.innerText = '@ ' + friend.name;
            nameSpan.style.flexGrow = '1';
            
            nameSpan.addEventListener('click', () => {
                const uid1 = currentUser.uid;
                const uid2 = friend.voiceId; 
                const dmPath = uid1 < uid2 ? `dms/${uid1}_${uid2}` : `dms/${uid2}_${uid1}`;
                switchChat(dmPath, '@ ' + friend.name);
            });
            
            const callFriendBtn = document.createElement('button');
            callFriendBtn.className = 'friend-call-btn';
            callFriendBtn.innerText = '📞';
            callFriendBtn.title = 'Call Friend';
            
            callFriendBtn.addEventListener('click', (e) => {
                e.stopPropagation(); 
                navigator.mediaDevices.getUserMedia({ video: false, audio: true })
                    .then((stream) => {
                        localAudioStream = stream;
                        const call = peer.call(friend.voiceId, stream);
                        setupCallUI(call);
                    })
                    .catch((err) => alert("Microphone access denied."));
            });
            
            div.appendChild(nameSpan);
            div.appendChild(callFriendBtn);
            document.getElementById('friends-list').appendChild(div);
        });

    } else {
        currentUser = null;
        authScreen.style.display = 'flex';
        appContainer.style.display = 'none';
        if (currentChatUnsubscribe) currentChatUnsubscribe();
    }
});

document.getElementById('add-friend-btn').addEventListener('click', () => {
    const fName = document.getElementById('friend-name-input').value.trim();
    const fId = document.getElementById('friend-id-input').value.trim();
    if (fName && fId && currentUser) {
        push(ref(db, 'users/' + currentUser.uid + '/friends'), { name: fName, voiceId: fId });
        document.getElementById('friend-name-input').value = '';
        document.getElementById('friend-id-input').value = '';
    }
});

document.getElementById('save-username-btn').addEventListener('click', () => {
    const newName = document.getElementById('username-input').value.trim();
    if (newName && currentUser) {
        updateProfile(currentUser, { displayName: newName })
            .then(() => {
                document.getElementById('current-username').innerText = newName;
                document.getElementById('username-input').value = '';
            })
            .catch(err => alert("Error updating name: " + err.message));
    }
});

document.getElementById('google-login-btn').addEventListener('click', () => {
    requestNotificationPermission(); // <--- Triggers on click
    signInWithPopup(auth, new GoogleAuthProvider()).catch(err => alert(err.message));
});

document.getElementById('email-login-btn').addEventListener('click', () => {
    requestNotificationPermission(); // <--- Triggers on click
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    signInWithEmailAndPassword(auth, email, password)
        .catch((err) => {
            if(err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
                createUserWithEmailAndPassword(auth, email, password).catch(e => alert(e.message));
            } else alert(err.message);
        });
});

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

function sendMessage() {
    const text = messageInput.value.trim();
    if (text && currentUser && currentChatRef) {
        const displayName = currentUser.displayName || currentUser.email.split('@')[0];
        
        push(currentChatRef, { name: displayName, text: text, timestamp: Date.now() })
            .catch((error) => {
                alert("Message Failed to Send: " + error.message);
            });
            
        messageInput.value = '';
    }
}

document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('message-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });