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
let chatJoinTime = Date.now();

// --- TIME FORMATTER ---
function formatTime(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// --- BROWSER NOTIFICATIONS ---
function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }
}

function triggerNotification(sender, text, chatTitle) {
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
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
    document.getElementById('call-status-text').innerHTML = `<span style="color: #23a559; font-weight: bold;">📞 Call in progress</span>`;
    document.getElementById('hangup-btn').style.display = 'inline-block';

    call.on('stream', (remoteStream) => {
        document.getElementById('remote-audio').srcObject = remoteStream;
    });

    call.on('close', resetCallUI);
}

function resetCallUI() {
    document.getElementById('call-status-text').innerHTML = `Your Voice ID: <b style="color: white;">${currentUser.uid}</b>`;
    document.getElementById('hangup-btn').style.display = 'none';
    
    if (currentCall) currentCall.close();
    if (localAudioStream) {
        localAudioStream.getTracks().forEach(track => track.stop());
    }
    document.getElementById('remote-audio').srcObject = null;
}

document.getElementById('hangup-btn').addEventListener('click', resetCallUI);


// --- EMOJI, GIF & FILE ATTACHMENTS LOGIC ---
const emojiBtn = document.getElementById('emoji-btn');
const emojiPopup = document.getElementById('emoji-picker-popup');
const gifBtn = document.getElementById('gif-btn');
const gifPopup = document.getElementById('gif-picker-popup');
const fileBtn = document.getElementById('file-btn');
const fileInput = document.getElementById('file-input');

// Toggle Emoji Picker
emojiBtn.addEventListener('click', () => {
    gifPopup.style.display = 'none';
    emojiPopup.style.display = emojiPopup.style.display === 'block' ? 'none' : 'block';
});

// Select Emoji
document.querySelector('emoji-picker').addEventListener('emoji-click', (e) => {
    document.getElementById('message-input').value += e.detail.unicode;
});

// Toggle GIF Picker
gifBtn.addEventListener('click', () => {
    emojiPopup.style.display = 'none';
    const isVisible = gifPopup.style.display === 'block';
    gifPopup.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) fetchGIFs('trending');
});

// Search GIFs from Giphy API
document.getElementById('gif-search-input').addEventListener('input', (e) => {
    const query = e.target.value.trim();
    fetchGIFs(query || 'trending');
});

function fetchGIFs(query) {
    const resultsDiv = document.getElementById('gif-results');
    resultsDiv.innerHTML = '<span style="font-size:0.8em; color:#949ba4;">Loading...</span>';

    const apiKey = 'GlV1O4WUEa9s6p8B3DksMmyBZSt73A9i'; // Giphy Public Key
    const url = query === 'trending' 
        ? `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=12`
        : `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=12`;

    fetch(url)
        .then(res => {
            if (!res.ok) throw new Error("Giphy Rate-Limited");
            return res.json();
        })
        .then(data => {
            resultsDiv.innerHTML = '';
            if (!data.data || data.data.length === 0) {
                resultsDiv.innerHTML = '<span style="font-size:0.8em; color:#949ba4;">No GIFs found</span>';
                return;
            }
            data.data.forEach(gif => {
                const img = document.createElement('img');
                img.src = gif.images.fixed_height_small.url;
                img.title = gif.title;
                img.addEventListener('click', () => {
                    sendMediaMessage(gif.images.original.url, 'image');
                    gifPopup.style.display = 'none';
                });
                resultsDiv.appendChild(img);
            });
        })
        .catch(err => {
            console.error("GIF Error:", err);
            resultsDiv.innerHTML = `
                <div style="font-size:0.8em; color:#da373c; grid-column: span 2; text-align: center;">
                    Giphy API rate-limited.<br>
                    <span style="color:#949ba4;">Tip: You can paste any .gif URL directly into the chat box!</span>
                </div>`;
        });
}

// File & Image Uploads
fileBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
        return alert("File is too large! Please choose a file under 3MB.");
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const fileData = event.target.result;
        const isImage = file.type.startsWith('image/');
        sendMediaMessage(fileData, isImage ? 'image' : 'file', file.name);
    };
    reader.readAsDataURL(file);
    fileInput.value = ''; // Reset input
});

function sendMediaMessage(content, type, fileName = '') {
    if (currentUser && currentChatRef) {
        const displayName = currentUser.displayName || currentUser.email.split('@')[0];
        push(currentChatRef, {
            name: displayName,
            text: content,
            type: type,
            fileName: fileName,
            timestamp: Date.now()
        });
    }
}


// --- CHAT SWITCHING LOGIC ---
function switchChat(chatPath, chatTitle) {
    document.getElementById('chat-header').innerText = chatTitle;
    document.getElementById('messages').innerHTML = '';
    
    emojiPopup.style.display = 'none';
    gifPopup.style.display = 'none';
    chatJoinTime = Date.now();
    
    if (currentChatUnsubscribe) {
        currentChatUnsubscribe(); 
    }
    
    currentChatRef = ref(db, chatPath);
    
    currentChatUnsubscribe = onChildAdded(currentChatRef, (snapshot) => {
        const data = snapshot.val();
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message-block';
        
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
        msgDiv.appendChild(headerDiv);

        // Render message depending on type
        if (data.type === 'image') {
            const img = document.createElement('img');
            img.src = data.text;
            img.className = 'chat-media-img';
            msgDiv.appendChild(img);
        } else if (data.type === 'file') {
            const fileLink = document.createElement('a');
            fileLink.href = data.text;
            fileLink.download = data.fileName || 'download';
            fileLink.style.color = '#5865F2';
            fileLink.innerText = `📎 ${data.fileName || 'Download File'}`;
            msgDiv.appendChild(fileLink);
        } else {
            const textSpan = document.createElement('span');
            textSpan.innerText = data.text;
            msgDiv.appendChild(textSpan);
        }

        document.getElementById('messages').appendChild(msgDiv);
        document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;

        const myName = currentUser.displayName || currentUser.email.split('@')[0];
        if (data.timestamp > chatJoinTime && data.name !== myName) {
            triggerNotification(data.name, data.type === 'image' ? '📷 Sent an image' : data.text, chatTitle);
        }
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

        if(!peer) initVoiceChat(); 
        
        switchChat('channels/general', '# general');
        
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
    requestNotificationPermission();
    signInWithPopup(auth, new GoogleAuthProvider()).catch(err => alert(err.message));
});

document.getElementById('email-login-btn').addEventListener('click', () => {
    requestNotificationPermission();
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

// --- SEND MESSAGE (Detects text vs image URLs) ---
function sendMessage() {
    const text = messageInput.value.trim();
    if (text && currentUser && currentChatRef) {
        const displayName = currentUser.displayName || currentUser.email.split('@')[0];
        
        // Auto-detect if user pasted a GIF or image URL directly
        const isImageUrl = text.match(/^https?:\/\/.*?\.(gif|png|jpg|jpeg|webp)(\?.*)?$/i);

        push(currentChatRef, {
            name: displayName,
            text: text,
            type: isImageUrl ? 'image' : 'text',
            timestamp: Date.now()
        }).catch(err => alert("Message Failed: " + err.message));

        messageInput.value = '';
        emojiPopup.style.display = 'none';
        gifPopup.style.display = 'none';
    }
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });