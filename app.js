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
    document.getElementById('call-btn').style.display = 'none';
    document.getElementById('hangup-btn').style.display = 'inline-block';

    call.on('stream', (remoteStream) => {
        document.getElementById('remote-audio').srcObject = remoteStream;
    });

    call.on('close', resetCallUI);
}

function resetCallUI() {
    document.getElementById('call-btn').style.display = 'inline-block';
    document.getElementById('hangup-btn').style.display = 'none';
    
    if (currentCall) currentCall.close();
    if (localAudioStream) {
        localAudioStream.getTracks().forEach(track => track.stop());
    }
    document.getElementById('remote-audio').srcObject = null;
}

document.getElementById('call-btn').addEventListener('click', () => {
    const targetId = document.getElementById('target-peer-id').value.trim();
    if (!targetId) return alert("Please enter an ID to call.");

    navigator.mediaDevices.getUserMedia({ video: false, audio: true })
        .then((stream) => {
            localAudioStream = stream;
            const call = peer.call(targetId, stream);
            setupCallUI(call);
        })
        .catch((err) => alert("Microphone access denied."));
});

document.getElementById('hangup-btn').addEventListener('click', resetCallUI);


// --- AUTH, CHAT & FRIENDS LOGIC ---
const authScreen = document.getElementById('auth-screen');
const appContainer = document.getElementById('app-container');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const chatRef = ref(db, 'channels/general');

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        authScreen.style.display = 'none';
        appContainer.style.display = window.innerWidth <= 768 ? 'flex' : 'flex';
        messageInput.disabled = false;
        sendBtn.disabled = false;
        
        document.getElementById('current-username').innerText = user.displayName || user.email.split('@')[0];

        if(!peer) initVoiceChat(); 
        
        // Load friends list
        document.getElementById('friends-list').innerHTML = '';
        const myFriendsRef = ref(db, 'users/' + user.uid + '/friends');
        
        onChildAdded(myFriendsRef, (snapshot) => {
            const friend = snapshot.val();
            const div = document.createElement('div');
            div.className = 'friend-item';
            
            const nameSpan = document.createElement('span');
            nameSpan.innerText = friend.name;
            
            const callFriendBtn = document.createElement('button');
            callFriendBtn.className = 'friend-call-btn';
            callFriendBtn.innerText = 'Call';
            
            callFriendBtn.addEventListener('click', () => {
                document.getElementById('target-peer-id').value = friend.voiceId;
                document.getElementById('call-btn').click();
            });
            
            div.appendChild(nameSpan);
            div.appendChild(callFriendBtn);
            document.getElementById('friends-list').appendChild(div);
        });

    } else {
        currentUser = null;
        authScreen.style.display = 'flex';
        appContainer.style.display = 'none';
    }
});

// Profile and Auth Buttons
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
    signInWithPopup(auth, new GoogleAuthProvider()).catch(err => alert(err.message));
});

document.getElementById('email-login-btn').addEventListener('click', () => {
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

// Chat sending and receiving
function sendMessage() {
    const text = messageInput.value.trim();
    if (text && currentUser) {
        const displayName = currentUser.displayName || currentUser.email.split('@')[0];
        push(chatRef, { name: displayName, text: text, timestamp: Date.now() });
        messageInput.value = '';
    }
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

onChildAdded(chatRef, (snapshot) => {
    const data = snapshot.val();
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message-block';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'sender-name';
    nameSpan.innerText = data.name;
    
    const textSpan = document.createElement('span');
    textSpan.innerText = data.text;
    
    msgDiv.appendChild(nameSpan);
    msgDiv.appendChild(textSpan);
    document.getElementById('messages').appendChild(msgDiv);
    document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
});