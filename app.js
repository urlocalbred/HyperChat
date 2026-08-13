import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithRedirect, getRedirectResult, GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, push, onChildAdded, remove, set, update, onValue } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// ==========================================
// 1. PASTE YOUR FIREBASE CONFIG HERE
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
let currentChatPath = null;
let currentChatUnsubscribe = null;
let chatJoinTime = Date.now();
let userRoles = {}; 

// ==========================================
// 2. PASTE YOUR FIREBASE UID HERE
const OWNER_UID = "NzV63xNtRUZEFvQSNHSbrrxMSrm2";
// ==========================================

function hasAdminPowers(uid) {
    if (uid === OWNER_UID) return true;
    const role = userRoles[uid];
    return role === 'Owner' || role === 'Co-owner' || role === 'Admin';
}

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

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag])
    );
}

function linkify(text) {
    const safeText = escapeHTML(text);
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return safeText.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #00a8fc; text-decoration: underline;">${url}</a>`;
    });
}

// --- VOICE CALLING LOGIC (PeerJS) ---
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

    peer.on('call', (call) => {
        incomingCall = call;
        document.getElementById('call-status-text').innerHTML = `<span style="color: #f1c40f; font-weight: bold;">📞 Incoming Call...</span>`;
        acceptBtn.style.display = 'inline-block';
        declineBtn.style.display = 'inline-block';
        hangupBtn.style.display = 'none';
    });
}

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

// --- MEDIA PICKERS ---
const emojiBtn = document.getElementById('emoji-btn');
const emojiPopup = document.getElementById('emoji-picker-popup');
const gifBtn = document.getElementById('gif-btn');
const gifPopup = document.getElementById('gif-picker-popup');
const fileBtn = document.getElementById('file-btn');
const fileInput = document.getElementById('file-input');

emojiBtn.addEventListener('click', () => {
    if(emojiBtn.disabled) return;
    gifPopup.style.display = 'none';
    emojiPopup.style.display = emojiPopup.style.display === 'block' ? 'none' : 'block';
});

document.querySelector('emoji-picker').addEventListener('emoji-click', (e) => {
    document.getElementById('message-input').value += e.detail.unicode;
});

gifBtn.addEventListener('click', () => {
    if(gifBtn.disabled) return;
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

fileBtn.addEventListener('click', () => {
    if(fileBtn.disabled) return;
    fileInput.click();
});

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


// --- DYNAMIC CHANNELS RENDERING ---
onValue(ref(db, 'channel_list'), (snapshot) => {
    const channelsContainer = document.getElementById('channels-container');
    if (!channelsContainer) return;
    
    channelsContainer.innerHTML = '';
    
    // Auto-create default channels if none exist (Owner setup)
    if (!snapshot.exists()) {
        if (currentUser && currentUser.uid === OWNER_UID) {
            set(ref(db, 'channel_list/welcome'), { name: 'welcome' });
            set(ref(db, 'channel_list/announcements'), { name: 'announcements' });
            set(ref(db, 'channel_list/general-1'), { name: 'general-1' });
        }
        return;
    }

    snapshot.forEach(child => {
        const chId = child.key;
        const chName = child.val().name;

        const div = document.createElement('div');
        div.className = 'channel-link';
        // Keep active highlight if we are currently in this chat
        if (currentChatPath === `channels/${chId}`) div.classList.add('active-chat-link');
        
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';

        const nameSpan = document.createElement('span');
        nameSpan.innerText = `# ${chName}`;
        nameSpan.style.flexGrow = '1';
        nameSpan.addEventListener('click', () => switchChat(`channels/${chId}`, `# ${chName}`, div));
        
        div.appendChild(nameSpan);

        // Edit & Delete icons for Admins
        if (currentUser && hasAdminPowers(currentUser.uid)) {
            const controls = document.createElement('div');
            
            const editBtn = document.createElement('button');
            editBtn.innerText = '✏️';
            editBtn.style = 'background:none; border:none; cursor:pointer; font-size:0.8em; padding: 0 4px;';
            editBtn.title = 'Rename Channel';
            editBtn.onclick = (e) => {
                e.stopPropagation();
                const newName = prompt(`Enter new name for #${chName}:`, chName);
                if (newName && newName.trim() !== '') {
                    update(ref(db, `channel_list/${chId}`), { name: newName.trim() });
                }
            };

            const delBtn = document.createElement('button');
            delBtn.innerText = '🗑️';
            delBtn.style = 'background:none; border:none; cursor:pointer; font-size:0.8em; padding: 0 4px;';
            delBtn.title = 'Delete Channel';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                if (chId === 'welcome' || chId === 'announcements') {
                    return alert("System Error: You cannot delete core system channels.");
                }
                if (confirm(`Are you SURE you want to permanently delete #${chName} and all its messages?`)) {
                    remove(ref(db, `channel_list/${chId}`));
                    remove(ref(db, `channels/${chId}`)); 
                    if (currentChatPath === `channels/${chId}`) switchChat('channels/welcome', '# welcome');
                }
            };
            
            controls.appendChild(editBtn);
            controls.appendChild(delBtn);
            div.appendChild(controls);
        }

        channelsContainer.appendChild(div);
    });
});


// --- CHAT MESSAGES RENDERING & RESTRICTIONS ---
function switchChat(chatPath, chatTitle, btnElement) {
    document.querySelectorAll('.channel-link').forEach(el => el.classList.remove('active-chat-link'));
    if (btnElement) btnElement.classList.add('active-chat-link');

    document.getElementById('chat-header').innerText = chatTitle;
    document.getElementById('messages').innerHTML = '';
    
    emojiPopup.style.display = 'none';
    gifPopup.style.display = 'none';
    chatJoinTime = Date.now();
    currentChatPath = chatPath; 
    
    const isAnnouncement = chatPath === 'channels/announcements';
    const isUserAdmin = currentUser && hasAdminPowers(currentUser.uid);

    if (isAnnouncement && !isUserAdmin) {
        document.getElementById('message-input').disabled = true;
        document.getElementById('message-input').placeholder = "Only admins can post in # announcements";
        document.getElementById('send-btn').disabled = true;
        document.getElementById('emoji-btn').disabled = true;
        document.getElementById('gif-btn').disabled = true;
        document.getElementById('file-btn').disabled = true;
    } else {
        document.getElementById('message-input').disabled = false;
        document.getElementById('message-input').placeholder = "Send a message...";
        document.getElementById('send-btn').disabled = false;
        document.getElementById('emoji-btn').disabled = false;
        document.getElementById('gif-btn').disabled = false;
        document.getElementById('file-btn').disabled = false;
    }

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

        // Fetch User Role dynamically and create Badge
        const userRole = data.uid ? userRoles[data.uid] : null;
        if (userRole) {
            const roleBadge = document.createElement('span');
            roleBadge.className = `role-badge role-${userRole.toLowerCase().replace(' ', '-')}`;
            roleBadge.innerText = userRole;
            headerDiv.appendChild(roleBadge);
        }
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.innerText = formatTime(data.timestamp);
        headerDiv.appendChild(timeSpan);

        // Delete Button
        if (currentUser && hasAdminPowers(currentUser.uid)) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-msg-btn';
            deleteBtn.innerText = '✖ Delete';
            deleteBtn.title = 'Delete message (Admin)';
            deleteBtn.addEventListener('click', () => {
                if (confirm("Delete this message?")) {
                    const msgRef = ref(db, `${chatPath}/${snapshot.key}`);
                    remove(msgRef).then(() => {
                        msgDiv.style.display = 'none'; 
                    }).catch(err => alert("Failed to delete: " + err.message));
                }
            });
            headerDiv.appendChild(deleteBtn);
        }

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
            textSpan.innerHTML = linkify(data.text);
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


// --- AUTH, ROLES & UI ---
const authScreen = document.getElementById('auth-screen');
const appContainer = document.getElementById('app-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const adminPanel = document.getElementById('admin-panel');
const channelManager = document.getElementById('channel-manager');
const roleAssigner = document.getElementById('role-assigner');

function updateSidebarProfile() {
    const dName = currentUser.displayName || currentUser.email.split('@')[0];
    document.getElementById('current-username').innerText = dName;
    document.getElementById('my-avatar').src = getAvatarUrl(currentUser.photoURL, dName);
}

function refreshAdminUI() {
    if (!currentUser) return;
    
    // Check general admin powers
    if (adminPanel) {
        if (hasAdminPowers(currentUser.uid)) {
            adminPanel.style.display = 'block';
            if (channelManager) channelManager.style.display = 'block';
        } else {
            adminPanel.style.display = 'none';
        }
    }
    
    // Check specific OWNER powers
    if (roleAssigner) {
        if (currentUser.uid === OWNER_UID) {
            roleAssigner.style.display = 'block';
        } else {
            roleAssigner.style.display = 'none';
        }
    }
}

getRedirectResult(auth).catch((err) => {
    alert("Google Sign-In Error: " + err.message);
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        authScreen.style.display = 'none';
        appContainer.style.display = window.innerWidth <= 768 ? 'flex' : 'flex';
        
        updateSidebarProfile();

        // Listen for Global Roles
        onValue(ref(db, 'roles'), (snapshot) => {
            userRoles = snapshot.val() || {};
            refreshAdminUI();
            
            // Re-render chat to update badges
            if (currentChatPath) {
                const activeBtn = document.querySelector('.active-chat-link');
                const title = document.getElementById('chat-header').innerText;
                switchChat(currentChatPath, title, activeBtn);
            }
        });

        if(!peer) initVoiceChat(); 
        
        switchChat('channels/welcome', '# welcome');
        
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
                switchChat(dmPath, '@ ' + friend.name, null);
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

// PASSWORD RESET
document.getElementById('forgot-password-link').addEventListener('click', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    if (!email) {
        return alert("Please enter your email address into the Email box first, then click 'Forgot Password?'.");
    }
    sendPasswordResetEmail(auth, email)
        .then(() => alert("Password reset email sent! Check your inbox (and spam folder)."))
        .catch(err => alert("Error: " + err.message));
});

// GOOGLE LOGIN 
document.getElementById('google-login-btn').addEventListener('click', () => {
    requestNotificationPermission();
    const provider = new GoogleAuthProvider();
    signInWithRedirect(auth, provider);
});

// EMAIL LOGIN
document.getElementById('email-login-btn').addEventListener('click', () => {
    requestNotificationPermission();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    
    if (!email || !password) return alert("Please enter both email and password.");

    signInWithEmailAndPassword(auth, email, password)
        .catch((err) => {
            if(err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
                createUserWithEmailAndPassword(auth, email, password)
                    .then(() => alert("Account successfully created! Welcome to HyperChat!"))
                    .catch(e => alert(e.message));
            } else alert("Login Error: " + err.message);
        });
});

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

// PROFILE LOGIC
document.getElementById('save-username-btn').addEventListener('click', () => {
    const newName = document.getElementById('username-input').value.trim();
    if (newName && currentUser) {
        updateProfile(currentUser, { displayName: newName }).then(() => {
            updateSidebarProfile();
            document.getElementById('username-input').value = '';
        }).catch(err => alert("Error updating name: " + err.message));
    }
});

document.getElementById('save-avatar-btn').addEventListener('click', () => {
    const newPic = document.getElementById('avatar-input').value.trim();
    if (newPic && currentUser) {
        updateProfile(currentUser, { photoURL: newPic }).then(() => {
            updateSidebarProfile();
            document.getElementById('avatar-input').value = '';
        }).catch(err => alert("Error updating Avatar: " + err.message));
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

// --- MESSAGE SENDING ---
function sendMediaMessage(content, type, fileName = '') {
    if (currentUser && currentChatRef) {
        const displayName = currentUser.displayName || currentUser.email.split('@')[0];
        push(currentChatRef, {
            uid: currentUser.uid, 
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
            uid: currentUser.uid, 
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


// --- ADMIN ACTIONS LOGIC ---
document.getElementById('create-channel-btn')?.addEventListener('click', () => {
    if (!currentUser || !hasAdminPowers(currentUser.uid)) return;
    
    const nameInput = document.getElementById('new-channel-input').value.trim();
    if (!nameInput) return alert("Please enter a channel name!");
    
    // Format ID safely (lowercase, spaces to dashes)
    const channelId = nameInput.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    set(ref(db, `channel_list/${channelId}`), { name: nameInput })
        .then(() => {
            document.getElementById('new-channel-input').value = '';
        })
        .catch(err => alert("Error creating channel: " + err.message));
});

document.getElementById('clear-channel-btn')?.addEventListener('click', () => {
    if (!currentUser || !hasAdminPowers(currentUser.uid)) return;
    
    if (confirm(`Are you sure you want to delete ALL messages in ${currentChatPath}?`)) {
        set(ref(db, currentChatPath || 'channels/general-1'), null)
            .then(() => {
                document.getElementById('messages').innerHTML = '';
                alert("Channel cleared successfully.");
            })
            .catch(err => alert("Error clearing chat: " + err.message));
    }
});

document.getElementById('system-announcement-btn')?.addEventListener('click', () => {
    if (!currentUser || !hasAdminPowers(currentUser.uid)) return;
    
    const announcement = prompt("Enter system announcement message:");
    if (announcement && currentChatRef) {
        push(currentChatRef, {
            uid: currentUser.uid, 
            name: "📣 SYSTEM ANNOUNCEMENT",
            photoURL: "https://api.dicebear.com/9.x/initials/svg?seed=SYS&backgroundColor=da373c",
            text: announcement,
            type: 'text',
            timestamp: Date.now()
        });
    }
});

document.getElementById('assign-role-btn')?.addEventListener('click', () => {
    if (!currentUser || currentUser.uid !== OWNER_UID) return; 

    const targetUid = document.getElementById('role-uid-input').value.trim();
    const role = document.getElementById('role-select').value;
    
    if (!targetUid) return alert("Please enter the user's Voice ID (UID) first!");
    
    if (role === "") {
        remove(ref(db, `roles/${targetUid}`))
            .then(() => alert("Role removed successfully!"))
            .catch(err => alert("Error: " + err.message));
    } else {
        set(ref(db, `roles/${targetUid}`), role)
            .then(() => alert(`Successfully assigned the [${role}] role!`))
            .catch(err => alert("Error: " + err.message));
    }
    
    document.getElementById('role-uid-input').value = '';
});