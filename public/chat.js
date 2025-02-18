const appPrefix = "secure-p2p-multichat-"; // the prefix we will prepend to usernames

const oldChats = localStorage.getItem("chats");
const chats = oldChats ? JSON.parse(oldChats) : [];

const app = new Vue({
    el: "#app",
    data: {
        screen: "login",
        usernameInput: localStorage.getItem("username"),
        peerError: "",
        loading: false,
        peer: {},
        targetIdInput: "",
        peerIds: [],
        connections: {},
        chats,
        chatMessageInput: ""
    },
    watch: {
        chats: function () {
            const chatbox = document.getElementById("chatbox");
            if (chatbox) chatbox.scrollTop = 99999999;
        }
    },
    methods: {

        resetChat: function () {
            this.chats = []; // Clear the chat array
            localStorage.setItem("chats", JSON.stringify(this.chats)); // Update local storage
        },
        getPeerId: username => appPrefix + username,
        getUsername: peerId => peerId ? peerId.slice(appPrefix.length) : "",

        saveKnownPeers: function () {
            localStorage.setItem("knownPeers", JSON.stringify(this.peerIds));
        },

        loadKnownPeers: function () {
            const storedPeers = localStorage.getItem("knownPeers");
            return storedPeers ? JSON.parse(storedPeers) : [];
        },

        addConnection: function (conn) {
            this.connections[conn.peer] = conn;
            this.updatePeerIds();

            // Send known peers to the newly connected peer
            conn.send({
                type: "presence-update",
                username: this.usernameInput,
                peerId: this.peer.id,
                onlineUsers: this.peerIds
            });

            // Save known peers to localStorage
            this.saveKnownPeers();

            console.log(`Connected to ${conn.peer}!`);
        },
        removeConnection: function (conn) {
            delete this.connections[conn.peer];
            this.updatePeerIds();
        },
        updatePeerIds: function () {
            this.peerIds = Object.keys(this.connections);
        },
        disconnectPeer: function () {
            this.peer.disconnect();
        },

        configureConnection: function (conn) {
            conn.on("data", data => {
                if (data.type === "presence-update") {
                    // Add the sender's peer ID if it's not already known
                    if (!this.peerIds.includes(data.peerId)) {
                        this.peerIds.push(data.peerId);
                    }

                    // Update known peers with the received list
                    data.onlineUsers.forEach(peerId => {
                        if (!this.peerIds.includes(peerId)) {
                            this.peerIds.push(peerId);
                        }
                    });

                    // Save known peers and update the display
                    this.saveKnownPeers();
                    this.updatePeerIds();
                } else if (data.type === "chat") {
                    this.receiveChat(data.chat);
                }
            });
            conn.on("close", () => this.removeConnection(conn));
            conn.on("error", () => this.removeConnection(conn));
        },

        initiateConnection: function (peerId) {
            if (!this.peerIds.includes(peerId) && peerId !== this.peer.id) {
                this.loading = true;
                this.peerError = "";

                console.log(`Connecting to ${peerId}...`);

                const options = {
                    metadata: {
                        peerIds: this.peerIds
                    },
                    serialization: "json"
                };
                const conn = this.peer.connect(peerId, options);
                this.configureConnection(conn);

                conn.on("open", () => {
                    this.addConnection(conn);
                    if (this.getUsername(conn.peer) === this.targetIdInput) {
                        this.targetIdInput = "";
                        this.loading = false;
                    }
                });
            }
        },

        createPeer: function () {
            this.peer = new Peer(this.getPeerId(this.usernameInput));
            this.peer.on("open", () => {
                this.screen = "chat";
                this.loading = false;
                this.peerError = "";

                // Attempt to connect to known peers
                const knownPeers = this.loadKnownPeers();
                knownPeers.forEach(peerId => this.initiateConnection(peerId));
            });

            this.peer.on("error", error => {
                if (error.type === "peer-unavailable") {
                    this.loading = false;
                    this.peerError = `${this.targetIdInput} is unreachable!`;
                    this.targetIdInput = "";
                } else if (error.type === "unavailable-id") {
                    this.loading = false;
                    this.peerError = `${this.usernameInput} is already taken!`;
                } else this.peerError = error;
            });

            this.peer.on('connection', conn => {
                if (!this.peerIds.includes(conn.peer)) {
                    this.configureConnection(conn);

                    conn.on("open", () => {
                        this.addConnection(conn);
                        conn.send({
                            type: "presence-update",
                            username: this.usernameInput,
                            peerId: this.peer.id,
                            onlineUsers: this.peerIds
                        });
                    });
                }
            });
        },

        submitLogin: function (event) {
            if (event) event.preventDefault();
            if (this.usernameInput.length > 0 && !this.loading) {
                this.loading = true;
                this.peerError = "";
                localStorage.setItem("username", this.usernameInput);
                this.createPeer();
            }
        },

        submitConnection: function (event) {
            event.preventDefault();
            const peerId = this.getPeerId(this.targetIdInput);
            this.initiateConnection(peerId);
        },

        receiveChat: function (chat) {
            this.chats.push(chat);
            localStorage.setItem("chats", JSON.stringify(this.chats));
        },

        submitChat: function (event) {
            event.preventDefault();
            if (this.chatMessageInput.length > 0) {
                const chat = {
                    sender: this.usernameInput,
                    message: this.chatMessageInput,
                    timestamp: new Date().getTime()
                };

                this.receiveChat(chat);
                Object.values(this.connections).forEach(conn => {
                    conn.send({
                        type: "chat",
                        chat
                    });
                });

                this.chatMessageInput = "";
            }
        }
    }
});
