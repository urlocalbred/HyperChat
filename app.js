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

// --- HELPERS ---
function formatTime(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function getAvatarUrl(photoURL, name) {
    return photoURL || `https://api.dicebear.com/9.x/initials/svg?seed=${name}&backgroundColor=5865F2`;
}

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

// Escapes raw HTML so users can't inject scripts
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag])
    );
}

// Converts raw links (http/https) to clickable HTML links
function linkify(text) {
    const safeText = escapeHTML(text);
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return safeText.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #00a8fc; text-decoration: underline;">${url}</a>`;
    });
}

// --- VOICE CALLING LOGIC (PeerJS with Accept/Decline) ---
let peer = null;
let currentCall = null;
let incomingCall = null;
let localAudioStream = null;

const acceptBtn = document.getElementById('accept-call-btn');
const declineBtn = document.getElementById('decline-call-btn');
const hangupBtn = document.getElementById('hangup-btn');

function initVoiceChat() {
    peer = new Peer(currentUser.uid); 
    peer.on('open', (id) => { document.getElementById('my-peer-id').innerText = id; });

    // Handle INCOMING Call
    peer.on('call', (call) => {
        incomingCall = call;
        document.getElementById('call-status-text').innerHTML = `<span style="color: #f1c40f; font-weight: bold;">📞 Incoming Call...</span>`;
        acceptBtn.style.display = 'inline-block';
        declineBtn.style.display = 'inline-block';
        hangupBtn.style.display = 'none';
    });
}

// User presses ACCEPT
acceptBtn.addEventListener('click', () => {
    if (!incomingCall) return;
    
    navigator.mediaDevices.getUserMedia({ video: false, audio: true })
        .then((stream) => {
            localAudioStream = stream;
            incomingCall.answer(stream);
            setupCallUI(incomingCall);
            incomingCall = null;
        })
        .catch((err) => {
            alert("Microphone access denied.");
            resetCallUI();
        });
});

// User presses DECLINE
declineBtn.addEventListener('click', () => {
    if (incomingCall) {
        incomingCall.close();
        incomingCall = null;
    }
    resetCallUI();
});

function setupCallUI(call) {
    currentCall = call;
    document.getElementById('call-status-text').innerHTML = `<span style="color: #23a559; font-weight: bold;">📞 Call in progress</span>`;
    acceptBtn.style.display = 'none';
    declineBtn.style.display = 'none';
    hangupBtn.style.display = 'inline-block';

    call.on('stream', (remoteStream) => { 
        document.getElementById('remote-audio').srcObject = remoteStream; 
    });
    call.on('close', resetCallUI);
}

function resetCallUI() {
    document.getElementById('call-status-text').innerHTML = `Your Voice ID: <b style="color: white;">${currentUser.uid}</b>`;
    acceptBtn.style.display = 'none';
    declineBtn.style.display = 'none';
    hangupBtn.style.display = 'none';
    
    if (currentCall) currentCall.close();
    if (localAudioStream) localAudioStream.getTracks().forEach(track => track.stop());
    document.getElementById('remote-audio').srcObject = null;
}

hangupBtn.addEventListener('click', resetCallUI);


// --- MEDIA PICKERS (Emoji, GIF, File) ---
const emojiBtn = document.getElementById('emoji-btn');
const emojiPopup = document.getElementById('emoji-picker-popup');
const gifBtn = document.getElementById('gif-btn');
const gifPopup = document.getElementById('gif-picker-popup');
const fileBtn = document.getElementById('file-btn');
const fileInput = document.getElementById('file-input');

emojiBtn.addEventListener('click', () => {
    gifPopup.style.display = 'none';
    emojiPopup.style.display = emojiPopup.style.display === 'block' ? 'none' : 'block';
});

document.querySelector('emoji-picker').addEventListener('emoji-click', (e) => {
    document.getElementById('message-input').value += e.detail.unicode;
});

gifBtn.addEventListener('click', () => {
    emojiPopup.style.display = 'none';
    const isVisible = gifPopup.style.display === 'block';
    gifPopup.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) fetchGIFs('trending');
});

document.getElementById('gif-search-input').addEventListener('input', (e) => {
    fetchGIFs(e.target.value.trim() || 'trending');
});

function fetchGIFs(query) {
    const resultsDiv = document.getElementById('gif-results');
    resultsDiv.innerHTML = '<span style="font-size:0.8em; color:#949ba4;">Loading...</span>';
    const apiKey = 'wXW3rc4aOzpk6GtnZaLBhvlzmGIv9JqN'; 
    const url = query === 'trending' 
        ? `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=12`
        : `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=12`;

    fetch(url).then(res => res.json()).then(data => {
        resultsDiv.innerHTML = '';
        if (!data.data || data.data.length === 0) return resultsDiv.innerHTML = '<span style="font-size:0.8em; color:#949ba4;">No GIFs found</span>';
        data.data.forEach(gif => {
            const img = document.createElement('img');
            img.src = gif.images.fixed_height_small.url;
            img.addEventListener('click', () => {
                sendMediaMessage(gif.images.original.url, 'image');
                gifPopup.style.display = 'none';
            });
            resultsDiv.appendChild(img);
        });
    }).catch(err => {
        resultsDiv.innerHTML = `<div style="font-size:0.8em; color:#da373c; grid-column: span 2;">API limited. Paste any .gif URL in chat!</div>`;
    });
}

fileBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return alert("File is too large! Max 3MB.");
    
    const reader = new FileReader();
    reader.onload = (event) => {
        const fileData = event.target.result;
        sendMediaMessage(fileData, file.type.startsWith('image/') ? 'image' : 'file', file.name);
    };
    reader.readAsDataURL(file);
    fileInput.value = ''; 
});


// --- CHAT RENDERING LOGIC ---
function switchChat(chatPath, chatTitle) {
    document.getElementById('chat-header').innerText = chatTitle;
    document.getElementById('messages').innerHTML = '';
    
    emojiPopup.style.display = 'none';
    gifPopup.style.display = 'none';
    chatJoinTime = Date.now();
    
    if (currentChatUnsubscribe) currentChatUnsubscribe(); 
    
    currentChatRef = ref(db, chatPath);
    
    currentChatUnsubscribe = onChildAdded(currentChatRef, (snapshot) => {
        const data = snapshot.val();
        
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message-block';
        
        const avatarImg = document.createElement('img');
        avatarImg.className = 'avatar msg-avatar';
        avatarImg.src = getAvatarUrl(data.photoURL, data.name);
        
        const contentCol = document.createElement('div');
        contentCol.className = 'message-content';
        
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
        contentCol.appendChild(headerDiv);

        if (data.type === 'image') {
            const img = document.createElement('img');
            img.src = data.text;
            img.className = 'chat-media-img';
            contentCol.appendChild(img);
        } else if (data.type === 'file') {
            const fileLink = document.createElement('a');
            fileLink.href = data.text;
            fileLink.download = data.fileName || 'download';
            fileLink.style.color = '#5865F2';
            fileLink.innerText = `📎 ${data.fileName || 'Download File'}`;
            contentCol.appendChild(fileLink);
        } else {
            const textSpan = document.createElement('span');
            textSpan.innerHTML = linkify(data.text); // Render URLs as clickable links safely
            contentCol.appendChild(textSpan);
        }

        msgDiv.appendChild(avatarImg);
        msgDiv.appendChild(contentCol);
        
        document.getElementById('messages').appendChild(msgDiv);
        document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;

        const myName = currentUser.displayName || currentUser.email.split('@')[0];
        if (data.timestamp > chatJoinTime && data.name !== myName) {
            triggerNotification(data.name, data.type === 'image' ? '📷 Sent an image' : data.text, chatTitle);
        }
    });
}

document.getElementById('general-channel-btn').addEventListener('click', () => switchChat('channels/general', '# general'));


// --- AUTH & PROFILE SETTINGS LOGIC ---
const authScreen = document.getElementById('auth-screen');
const appContainer = document.getElementById('app-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');

function updateSidebarProfile() {
    const dName = currentUser.displayName || currentUser.email.split('@')[0];
    document.getElementById('current-username').innerText = dName;
    document.getElementById('my-avatar').src = getAvatarUrl(currentUser.photoURL, dName);
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        authScreen.style.display = 'none';
        appContainer.style.display = window.innerWidth <= 768 ? 'flex' : 'flex';
        
        messageInput.disabled = false;
        sendBtn.disabled = false;
        
        updateSidebarProfile();

        if(!peer) initVoiceChat(); 
        switchChat('channels/general', '# general');
        
        // Render Friends List
        document.getElementById('friends-list').innerHTML = '';
        const myFriendsRef = ref(db, 'users/' + user.uid + '/friends');
        
        onChildAdded(myFriendsRef, (snapshot) => {
            const friend = snapshot.val();
            const div = document.createElement('div');
            div.className = 'friend-item';
            
            const fAvatar = document.createElement('img');
            fAvatar.className = 'avatar friend-avatar';
            fAvatar.src = getAvatarUrl(null, friend.name);
            
            const nameContainer = document.createElement('div');
            nameContainer.style.display = 'flex';
            nameContainer.style.alignItems = 'center';
            nameContainer.style.flexGrow = '1';
            
            const nameSpan = document.createElement('span');
            nameSpan.innerText = friend.name;
            
            nameContainer.appendChild(fAvatar);
            nameContainer.appendChild(nameSpan);
            
            nameContainer.addEventListener('click', () => {
                const uid1 = currentUser.uid;
                const uid2 = friend.voiceId; 
                const dmPath = uid1 < uid2 ? `dms/${uid1}_${uid2}` : `dms/${uid2}_${uid1}`;
                switchChat(dmPath, '@ ' + friend.name);
            });
            
            const callFriendBtn = document.createElement('button');
            callFriendBtn.className = 'friend-call-btn';
            callFriendBtn.innerText = '📞';
            
            // Initiate OUTGOING call directly on click
            callFriendBtn.addEventListener('click', (e) => {
                e.stopPropagation(); 
                navigator.mediaDevices.getUserMedia({ video: false, audio: true })
                    .then((stream) => {
                        localAudioStream = stream;
                        const call = peer.call(friend.voiceId, stream);
                        setupCallUI(call);
                    }).catch(err => alert("Microphone access denied."));
            });
            
            div.appendChild(nameContainer);
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

// Update Username
document.getElementById('save-username-btn').addEventListener('click', () => {
    const newName = document.getElementById('username-input').value.trim();
    if (newName && currentUser) {
        updateProfile(currentUser, { displayName: newName }).then(() => {
            updateSidebarProfile();
            document.getElementById('username-input').value = '';
        }).catch(err => alert("Error updating name: " + err.message));
    }
});

// Update PFP Avatar
document.getElementById('save-avatar-btn').addEventListener('click', () => {
    const newPic = document.getElementById('avatar-input').value.trim();
    if (newPic && currentUser) {
        updateProfile(currentUser, { photoURL: newPic }).then(() => {
            updateSidebarProfile();
            document.getElementById('avatar-input').value = '';
        }).catch(err => alert("Error updating Avatar: " + err.message));
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


// --- MESSAGE SENDING LOGIC ---
function sendMediaMessage(content, type, fileName = '') {
    if (currentUser && currentChatRef) {
        const displayName = currentUser.displayName || currentUser.email.split('@')[0];
        push(currentChatRef, {
            name: displayName,
            photoURL: currentUser.photoURL || '',
            text: content,
            type: type,
            fileName: fileName,
            timestamp: Date.now()
        });
    }
}

function sendMessage() {
    const text = messageInput.value.trim();
    if (text && currentUser && currentChatRef) {
        const displayName = currentUser.displayName || currentUser.email.split('@')[0];
        const isImageUrl = text.match(/^https?:\/\/.*?\.(gif|png|jpg|jpeg|webp)(\?.*)?$/i);

        push(currentChatRef, {
            name: displayName,
            photoURL: currentUser.photoURL || '',
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