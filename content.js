let lastPageVisited ="";

let currentProblemMeta = null;
let currentProblemId = null;

// Global variable to store data from '/users/profile/private'
let userProfileData = null;

//3 
// Initialize the observer to start observing DOM changes
addBookmarkButton();
observeForSPAChanges(); // Important for Single Page Apps
observePageChanges(); // Start observing DOM changes
handleContentChange();
addInjectScript();  // so that when are we going on different page it we still inject the files

// Define a color palette as constants
const COLORS = {
    PRIMARY: "#F7A478",  // Main primary color
    DARK: "#0A0902",     // Dark theme color
    NAVY: "#151D26",     // Deep navy color
    BLUE: "#1F3049",     // Blue shade
    LIGHT_BLUE: "#435773", // Lighter blue shade
    STEEL_BLUE: "#2B384E" // Steel blue shade
};

// Example usage in your code
console.log("Primary color is:", COLORS.PRIMARY);
console.log("Dark theme color is:", COLORS.DARK);


// Token management constants
const MAX_HISTORY_TOKENS = 3000;
const TRUNCATED_FLAG = "...[truncated]";

// Staged hint system
const HINT_LEVELS = {
  1: "Conceptual guidance (vague direction)",
  2: "Approach suggestion",
  3: "Pseudocode structure",
  4: "Partial solution",
  5: "Full solution (LAST RESORT)"
};
let hintLevel = 1;


function attachNavListenersToRemoveChatbox() {
    const navLis = document.querySelectorAll(
        'ul.d-flex.flex-row.gap-2.justify-content-between.m-0.hide-scrollbar > li'
    );

    navLis.forEach((li) => {
        li.addEventListener("click", (e) => {
            // Only remove chatbox if clicked element is NOT our AI button
            const clickedButton = li.querySelector("#ai-helper-button");
            if (!clickedButton || !clickedButton.contains(e.target)) {
                removeChatboxIfExists();
            }
        });
    });
}



function removeChatboxIfExists() {
    const chatbox = document.getElementById("ai-chatbox");
    if (chatbox) {
        chatbox.remove();
        console.log("💨 Chatbox removed due to nav tab click");
        setTabContentVisibility(true);
    }
}


function observeForSPAChanges() {
    const observer = new MutationObserver(() => {
        const ul = document.querySelector('ul.d-flex.flex-row.gap-2.justify-content-between.m-0.hide-scrollbar');
        if (ul && !document.getElementById("ai-helper-button")) {
            addBookmarkButton();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    console.log("👀 SPA MutationObserver active...");
}


function addBookmarkButton() {
    if (document.getElementById("ai-helper-button")) return;

    const targetUl = document.querySelector('ul.d-flex.flex-row.gap-2.justify-content-between.m-0.hide-scrollbar');
    // if (!targetUl) {
    //     console.warn("❌ Target <ul> not found!");
    //     return;
    // }

    const liList = targetUl.querySelectorAll('li');
    const lastLi = liList[liList.length - 1];

    // Create AI Helper button
    const aiButton = document.createElement("button");
    aiButton.id = "ai-helper-button";
    aiButton.innerText = "AI Helper";
    aiButton.className = "dmsans"; // For font consistency

    // Style to match but stand out
    aiButton.style.padding = "0.36rem 1rem";
    aiButton.style.whiteSpace = "nowrap";
    aiButton.style.fontFamily = "DM Sans, sans-serif";
    aiButton.style.cursor = "pointer";
    aiButton.style.border = "none";
    aiButton.style.borderRadius = "8px";
    aiButton.style.background = "linear-gradient(to right, #4facfe, #00f2fe)";
    aiButton.style.color = "white";
    aiButton.style.fontWeight = "600";
    aiButton.style.boxShadow = "0 0 8px rgba(0, 242, 254, 0.5)";
    aiButton.style.transition = "all 0.3s ease-in-out";

    aiButton.addEventListener("mouseenter", () => {
        aiButton.style.transform = "scale(1.05)";
        aiButton.style.boxShadow = "0 0 12px rgba(0, 242, 254, 0.8)";
    });
    aiButton.addEventListener("mouseleave", () => {
        aiButton.style.transform = "scale(1)";
        aiButton.style.boxShadow = "0 0 8px rgba(0, 242, 254, 0.5)";
    });

    aiButton.addEventListener("click", (e) => {
        e.stopPropagation(); // prevent parent <li> click from firing
        toggleChatbox();
  });


    // Wrap in <li> to match UI
    const buttonWrapper = document.createElement("li");
    buttonWrapper.className = "d-flex flex-row rounded-3 dmsans align-items-center coding_list__V_ZOZ coding_card_mod_unactive__O_IEq";
    buttonWrapper.appendChild(aiButton);

    targetUl.appendChild(buttonWrapper);

    attachNavListenersToRemoveChatbox(); // 👇 ensures cleanup
    console.log("✅ AI Helper button styled & added!");
}




function buildConversationHistoryFromLocal(problemId) {
  console.log("🧠 Loaded from localStorage:", localStorage.getItem(getChatKey(problemId)));

  const raw = loadChatHistory(problemId); // [{ from: "user" | "ai", text }]
  return raw.map((msg) => ({
    role: msg.from === "user" ? "user" : "model",
    parts: [{ text: msg.text }],
  }));
}

// API
async function getAPIKey() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get("apiKey", (result) => {
            if (result.apiKey) {
                resolve(result.apiKey);
            } else {
                reject("API key not found. Please set it in the extension popup.");
            }
        });
    });
}

// AI RESPONSE HANDLER WITH PROMPT ENGINEERING
async function getAIResponse(userMessage, problemId) {
  try {
    const GEMINI_API_KEY = await getAPIKey();
    const problemData = window.currentProblemMeta?.data || {};
    
    // Build intelligent context-aware prompt
    const systemPrompt = buildSystemPrompt(problemData);
    const conversationHistory = buildConversationHistory(problemId);
    
    // Truncate history to token limit
    const {truncatedHistory} = truncateHistory(
      conversationHistory, 
      MAX_HISTORY_TOKENS - countTokens(systemPrompt)
    );

    const fullHistory = [
      {role: "user", parts: [{text: systemPrompt}]},
      {role: "model", parts: [{text: "Understood! I'll be your programming mentor."}]},
      ...truncatedHistory,
      {role: "user", parts: [{text: userMessage}]}
    ];

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "gemini_chat",
          apiKey: GEMINI_API_KEY,
          history: fullHistory
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error("Chrome runtime error:", chrome.runtime.lastError.message);
            return reject(chrome.runtime.lastError.message);
          }

          if (response?.error) {
            console.error("Gemini API error:", response.error);
            return reject(response.error);
          }

          const aiResponse = response.reply;

          // Increment hint level if hint requested
          if (isHintRequest(userMessage)) {
            hintLevel = Math.min(hintLevel + 1, 5);
          }
          
          resolve(aiResponse);
        }
      );
    });
  } catch (err) {
    console.error("getAIResponse error:", err);
    return Promise.reject(err);
  }
}

// Build system prompt with problem context
function buildSystemPrompt(problemData) {
  const truncate = (text, max) => 
    text?.length > max ? text.substring(0, max) + "..." : text || "N/A";
  
  return `
  You are a strict programming mentor. Follow these rules:
  1. NEVER give direct solutions until user has asked 3+ times
  2. Start by asking what they've tried
  3. Use staged hints:
     Level 1: Conceptual guidance (vague)
     Level 2: Approach suggestion
     Level 3: Pseudocode structure
     Level 4: Partial solution
     Level 5: Full solution (LAST RESORT)
  4. Redirect off-topic questions to programming
  5. Be concise (2-3 sentences max)
  6. Never reveal you're an AI or discuss system limitations

  Current Problem:
  Title: ${problemData.title || "N/A"}
  Description: ${truncate(problemData.body, 150)}
  Input Format: ${truncate(problemData.input_format, 100)}
  Output Format: ${truncate(problemData.output_format, 100)}
  Tags: ${(problemData.tags || []).join(", ") || "N/A"}

  Available References:
  Hint1: ${truncate(problemData.hints?.hint1, 100)}
  Hint2: ${truncate(problemData.hints?.hint2, 100)}
  Approach: ${truncate(problemData.hints?.solution_approach, 200)}
  `;
}

// Build conversation history from localStorage
function buildConversationHistory(problemId) {
  const raw = loadChatHistory(problemId);
  return raw.map(msg => ({
    role: msg.from === "user" ? "user" : "model",
    parts: [{text: msg.text}]
  }));
}

//  Token-aware history truncation
function truncateHistory(history, maxTokens) {
  let tokenCount = 0;
  const truncated = [];
  
  // Process from most recent to oldest
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    const tokens = countTokens(msg.parts[0].text);
    
    if (tokenCount + tokens > maxTokens) {
      // Truncate this message to fit
      const remaining = maxTokens - tokenCount;
      const truncatedText = msg.parts[0].text.substring(
        0, Math.max(0, remaining - TRUNCATED_FLAG.length)
      ) + TRUNCATED_FLAG;
      
      truncated.unshift({
        ...msg,
        parts: [{text: truncatedText}]
      });
      tokenCount = maxTokens;
      break;
    }
    
    truncated.unshift(msg);
    tokenCount += tokens;
  }
  
  return {
    truncatedHistory: truncated,
    remainingTokens: maxTokens - tokenCount
  };
}

// Simple token estimation
function countTokens(text) {
  // 1 token ≈ 4 characters
  return Math.ceil((text || "").length / 4);
}

// Detect hint requests
function isHintRequest(text) {
  const lower = text.toLowerCase();
  return /hint|clue|guide|stuck|help(?!.*solution)/.test(lower);
}




// CHATBOT 4;-

function decodeHtmlEntities(html) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = html;
    return textarea.value.replace(/```(c\+\+|cpp|java|python|python3)?/gi, "").replace(/```/g, "").trim();
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getChatKey(problemId) {
  return `chat_history_${problemId}`;
}

function saveChatMessage(problemId, from, text) {
  if (!problemId) {
    console.error("Cannot save message - no problem ID available");
    return false;
  }
  
  try {
    const key = `chat_history_${problemId}`;
    const prev = JSON.parse(localStorage.getItem(key) || '[]');
    const updated = [...prev, { from, text }];
    localStorage.setItem(key, JSON.stringify(updated));
    
    // Store this as the last active problem
    localStorage.setItem('last_active_problem', problemId);
    return true;
  } catch (e) {
    console.error("Failed to save chat message:", e);
    return false;
  }
}

function loadChatHistory(problemId) {
  if (!problemId) {
    console.warn("No problem ID provided for chat history");
    return [];
  }
  
  try {
    const key = `chat_history_${problemId}`;
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch (e) {
    console.error("Failed to load chat history:", e);
    return [];
  }
}

function renderMessage(from, text, container) {
  const messageDiv = document.createElement("div");
  messageDiv.style.padding = "10px";
  messageDiv.style.margin = "5px 0";
  messageDiv.style.borderRadius = "10px";
  messageDiv.style.boxShadow = `0 2px 4px ${COLORS.DARK}`;
  messageDiv.style.maxWidth = "70%";
  messageDiv.style.display = "flex";
  messageDiv.style.flexDirection = "column";

  const contentDiv = document.createElement("div");
  const timeSpan = document.createElement("div");

  timeSpan.innerText = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  timeSpan.style.fontSize = "10px";
  timeSpan.style.color = "#ccc";
  timeSpan.style.marginTop = "6px";
  timeSpan.style.alignSelf = from === "user" ? "flex-end" : "flex-start";


  if (from === "user") {
    messageDiv.style.backgroundColor = COLORS.STEEL_BLUE;
    messageDiv.style.color = "white";
    messageDiv.style.marginLeft = "auto";
    messageDiv.style.textAlign = "right";
    contentDiv.innerText = text;
  } else {
    messageDiv.style.backgroundColor = COLORS.NAVY;
    messageDiv.style.color = "white";
    messageDiv.style.marginRight = "auto";
    messageDiv.style.textAlign = "left";
    contentDiv.innerHTML = text;
  }

  messageDiv.appendChild(contentDiv);
  messageDiv.appendChild(timeSpan);

  const containerWrapper = document.createElement("div");
  containerWrapper.style.display = "flex";
  containerWrapper.style.alignItems = "flex-end";
  containerWrapper.appendChild(messageDiv);
  container.appendChild(containerWrapper);
  container.scrollTop = container.scrollHeight;
}


function showTypingIndicator(container) {
  const typingDiv = document.createElement("div");
  typingDiv.id = "typing-indicator";
  typingDiv.innerText = "AI is typing...";
  typingDiv.style.padding = "10px";
  typingDiv.style.margin = "5px 0";
  typingDiv.style.fontStyle = "italic";
  typingDiv.style.color = "#aaa";
  typingDiv.style.backgroundColor = COLORS.NAVY;
  typingDiv.style.borderRadius = "10px";
  typingDiv.style.marginRight = "auto";
  typingDiv.style.maxWidth = "70%";

  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "flex-end";
  wrapper.appendChild(typingDiv);
  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;
}

function addHistoryToolbar(chatbox, messagesContainer, problemId) {
  const toolbar = document.createElement("div");
  toolbar.style.display = "flex";
  toolbar.style.justifyContent = "flex-end";
  toolbar.style.gap = "10px";
  toolbar.style.padding = "8px 10px";
  toolbar.style.backgroundColor = COLORS.BLUE;
  toolbar.style.borderBottom = `1px solid ${COLORS.STEEL_BLUE}`;

  // Clear Button
  const clearButton = document.createElement("button");
  clearButton.innerText = "🧹 Clear";
  clearButton.style.background = COLORS.PRIMARY;
  clearButton.style.color = COLORS.DARK;
  clearButton.style.border = "none";
  clearButton.style.padding = "5px 10px";
  clearButton.style.borderRadius = "6px";
  clearButton.style.cursor = "pointer";
  clearButton.addEventListener("click", () => {
    messagesContainer.innerHTML = ""; // Only clear the UI
    console.log("Chat UI cleared (history preserved in localStorage)");
  });

  // Delete Button
  const deleteButton = document.createElement("button");
  deleteButton.innerText = "🗑️ Delete";
  deleteButton.style.backgroundColor = "crimson";
  deleteButton.style.color = "white";
  deleteButton.style.border = "none";
  deleteButton.style.padding = "5px 10px";
  deleteButton.style.borderRadius = "6px";
  deleteButton.style.cursor = "pointer";
  deleteButton.addEventListener("click", () => {
    if (confirm("Are you sure you want to permanently delete this chat history?")) {
      if (problemId) {
        localStorage.removeItem(`chat_history_${problemId}`);
        messagesContainer.innerHTML = "";
        console.log("Chat history permanently deleted from localStorage");
      }
    }
  });

  toolbar.appendChild(clearButton);
  toolbar.appendChild(deleteButton);

  // Append toolbar between header and chatInner
  chatbox.appendChild(toolbar);
}



// function setTabContentVisibility(visible) {
//   const container = document.querySelector('.coding_leftside_scroll__CMpky');
//   if (!container) return;

//   for (const child of container.children) {
//     if (child.id !== "ai-chatbox") {
//       if (!visible) {
//         // Save the current display if not saved already
//         if (!child.dataset.originalDisplay) {
//           child.dataset.originalDisplay = getComputedStyle(child).display;
//         }
//         child.style.display = "none";
//       } else {
//         // Restore original display
//         child.style.display = child.dataset.originalDisplay || "";
//       }
//     }
//   }
// }

let previouslyHidden = [];

function setTabContentVisibility(visible) {
  const container = document.querySelector('.coding_leftside_scroll__CMpky');
  if (!container) return;

  if (!visible) {
    previouslyHidden = [];
    for (const child of container.children) {
      if (child.id !== 'ai-chatbox' && getComputedStyle(child).display !== 'none') {
        previouslyHidden.push(child);
        child.style.setProperty('display', 'none', 'important');
      }
    }
  } else {
    for (const el of previouslyHidden) {
      el.style.removeProperty('display');
    }
    previouslyHidden = [];
  }
}

function showErrorToUser(message) {
  const errorDiv = document.createElement("div");
  errorDiv.style.color = "red";
  errorDiv.style.padding = "10px";
  errorDiv.style.margin = "10px 0";
  errorDiv.style.border = "1px solid red";
  errorDiv.style.borderRadius = "5px";
  errorDiv.innerText = message;
  
  const chatbox = document.getElementById("ai-chatbox");
  if (chatbox) {
    chatbox.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
  }
}

function toggleChatbox() {
    let chatbox = document.getElementById("ai-chatbox");

    if (!chatbox) {
        // Create the chatbox container
        chatbox = document.createElement("div");
        chatbox.id = "ai-chatbox";
        chatbox.style.marginTop = "10px";
        chatbox.style.padding = "10px";
        chatbox.style.border = `1px solid ${COLORS.STEEL_BLUE}`;
        chatbox.style.borderRadius = "10px";
        chatbox.style.boxShadow = `0 4px 6px ${COLORS.DARK}`;
        chatbox.style.position = "relative";  // or "absolute" if you prefer
        chatbox.style.zIndex = "99";        // force it on top of all tab content
        chatbox.style.backgroundColor = COLORS.NAVY;
        chatbox.style.width = "100%"; // Make it 100% of its container width
        chatbox.style.height = "auto"; // Adjust height based on content
        chatbox.style.resize = "both"; // Allow both horizontal and vertical resizing
        chatbox.style.overflow = "auto"; // Handle overflow during resize
        chatbox.style.fontFamily = "'Arial', sans-serif";
        chatbox.style.display = "block"; 
        chatbox.style.minWidth = "200px"; // Minimum width
        chatbox.style.minHeight = "150px"; // Minimum height

        const chatInner = document.createElement("div");
        chatInner.style.display = "flex";
        chatInner.style.flexDirection = "column";
        chatInner.style.height = "300px"; // Or whatever height you want
        chatInner.style.overflow = "hidden";


        // Chatbox header
        const header = document.createElement("div");
        header.style.backgroundColor = COLORS.PRIMARY;
        header.style.color = COLORS.DARK;
        header.style.padding = "10px";
        header.style.fontSize = "16px";
        header.style.fontWeight = "bold";
        header.style.borderTopLeftRadius = "10px";
        header.style.borderTopRightRadius = "10px";
        header.style.display = "flex";
        header.style.justifyContent = "space-between";
        header.style.alignItems = "center";

        const headerText = document.createElement("span");
        headerText.innerText = "AI Chatbot";

        // Close button
        const closeButton = document.createElement("button");
        closeButton.innerText = "X";
        closeButton.style.backgroundColor = "transparent";
        closeButton.style.border = "none";
        closeButton.style.color = COLORS.DARK;
        closeButton.style.fontSize = "14px";
        closeButton.style.cursor = "pointer";
        closeButton.addEventListener("click", () => {
            chatbox.style.display = "none";
            setTabContentVisibility(true); // 🛠️ Restore tab content
        });

        header.appendChild(headerText);
        header.appendChild(closeButton);

        // Chat messages container
        const messagesContainer = document.createElement("div");
        messagesContainer.style.flexGrow = "1";
        messagesContainer.style.overflowY = "auto";
        messagesContainer.style.maxHeight = "100%";

        messagesContainer.id = "chat-messages";
        // Load chat history when chatbox is created
        const problemId = getCurrentProblemId();
        if (problemId) {
            const history = loadChatHistory(problemId);
            for (let i = 0; i < history.length; i++) {
                const entry = history[i];
                renderMessage(entry.from, entry.text, messagesContainer);
            }
        }

        messagesContainer.style.padding = "10px";
        messagesContainer.style.overflowY = "auto";
        messagesContainer.style.backgroundColor = COLORS.LIGHT_BLUE;
        messagesContainer.style.flexGrow = "1"; // Allow messages container to grow
        messagesContainer.style.minHeight = "100px"; // Minimum height for messages container


        // Input container
        const inputContainer = document.createElement("div");
        inputContainer.style.display = "flex";
        inputContainer.style.padding = "10px";
        inputContainer.style.borderTop = `1px solid ${COLORS.STEEL_BLUE}`;
        inputContainer.style.backgroundColor = COLORS.BLUE;
        inputContainer.style.flexShrink = "0";


        const inputBox = document.createElement("input");
        inputBox.type = "text";
        inputBox.placeholder = "Type your message...";
        inputBox.style.flex = "1"; // Take up remaining space
        inputBox.style.padding = "10px";
        inputBox.style.border = `1px solid ${COLORS.LIGHT_BLUE}`;
        inputBox.style.borderRadius = "5px";
        inputBox.style.marginRight = "10px";

        inputBox.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendButton.click();
          }
        });


        const sendButton = document.createElement("button");
        sendButton.innerText = "Send";
        sendButton.style.backgroundColor = COLORS.PRIMARY;
        sendButton.style.color = COLORS.DARK;
        sendButton.style.border = "none";
        sendButton.style.padding = "10px 15px";
        sendButton.style.borderRadius = "5px";
        sendButton.style.cursor = "pointer";

         function wantsEditorial(text) {
            const lower = text.toLowerCase();
            const fetchPatterns = [
                /give.*editorial/,
                /show.*editorial/,
                /fetch.*editorial/,
                /want.*editorial/,
                /get.*editorial/,
                /editorial code.*please/,
                /can you.*editorial/,
                /editorial.*solution/,
                /send.*editorial/,
                /^editorial$/
            ];
            return fetchPatterns.some((regex) => regex.test(lower));
        }

        function wantsSection(text) {
            const lower = text.toLowerCase();

            if (/input.*format/.test(lower)) return "input_format";
            if (/output.*format/.test(lower)) return "output_format";
            if (/sample.*input/.test(lower)) return "sample_io";
            if (/hint ?1/.test(lower)) return "hint1";
            if (/hint ?2/.test(lower)) return "hint2";
            if (/hints?/.test(lower)) return "both_hints";
            if (/solution|approach/.test(lower)) return "solution";
            if (/tags?/.test(lower)) return "tags";
            if (/body|problem statement/.test(lower)) return "body";

            return null; // fallback for normal AI questions
        }
        
        async function handleMessageSend() {
          const problemId = getCurrentProblemId();
          if (!problemId) {
            console.error("Cannot save message - no problem ID detected");
            showErrorToUser("Could not identify current problem. Please refresh the page.");
            return;
          }
          const message = inputBox.value.trim();
          const meta = window.currentProblemMeta?.data || {};
          const sectionRequest = wantsSection(message);

          console.log("before message");

          if (message) {
              console.log("after message");

              // Create a container to hold both the user input and the highlighted message
              const messageContainer = document.createElement("div");
              messageContainer.style.display = "flex"; // Flexbox to align the input and highlighted message
              messageContainer.style.alignItems = "flex-end"; // Align both elements to the bottom of the container

              // Display the user's message in the chatbox (highlighted on the right)
              const userMessageDiv = document.createElement("div");
              userMessageDiv.style.backgroundColor = COLORS.STEEL_BLUE; // Reverted to previous highlight color for user input
              userMessageDiv.style.color = "white"; // Dark text for contrast
              userMessageDiv.style.padding = "10px";
              userMessageDiv.style.margin = "5px 0";
              userMessageDiv.style.borderRadius = "10px";
              userMessageDiv.style.boxShadow = `0 2px 4px ${COLORS.DARK}`; // Subtle shadow for highlighting
              userMessageDiv.style.textAlign = "right"; // Align text to the right (for user input)
              userMessageDiv.style.maxWidth = "70%"; // Optional: Limit the width of the message
              userMessageDiv.style.marginLeft = "auto"; // Align message to the right
              userMessageDiv.innerText = message;

              // Add the user message to the container
              messageContainer.appendChild(userMessageDiv);

              // Add the message container to the messages container
              messagesContainer.appendChild(messageContainer);
              // if (window.currentProblemMeta && window.currentProblemMeta.data && window.currentProblemMeta.data.id) {
              //     saveChatMessage(window.currentProblemMeta.data.id, 'user', message);
              // }

              messagesContainer.scrollTop = messagesContainer.scrollHeight; // Auto-scroll to the latest message

              inputBox.value = ""; // Clear the input box

              // Fetch and display AI response
              console.log("before response");

              showTypingIndicator(messagesContainer);
              try {
                  let aiResponse = "";

                  if (wantsEditorial(message)) {
                      const meta = window.currentProblemMeta;
                      console.log("🔍 Editorial Debug Check:", meta);
                      if (
                          window.currentProblemMeta &&
                          window.currentProblemMeta.data &&
                          Array.isArray(window.currentProblemMeta.data.editorial_code) &&
                          window.currentProblemMeta.data.editorial_code.length > 0
                        ) {
                          aiResponse = meta.data.editorial_code
                          .map((item) => {
                              const rawCode = item.code.replace(/```.*?\n|```/g, "").trim(); // Remove markdown ``` blocks
                              const escapedCode = escapeHtml(rawCode); // Escape < and > to prevent HTML breaking
                              return (
                              `<div><strong>${item.language}</strong>:<br>` +
                              `<pre style="background:#1e1e1e;color:#eee;padding:10px;border-radius:5px;overflow:auto;">` +
                              `<code>${escapedCode}</code></pre></div>`
                              );
                          })
                          .join("\n\n");


                      } else {
                          aiResponse = "❌ No editorial code available for this problem.";
                      }
                  }else if (sectionRequest) {
                      switch (sectionRequest) {
                          case "input_format":
                          aiResponse = `<strong>Input Format:</strong><br>${meta.input_format || "Not available."}`;
                          break;
                          case "output_format":
                          aiResponse = `<strong>Output Format:</strong><br>${meta.output_format || "Not available."}`;
                          break;
                          case "sample_io":
                          aiResponse =
                              `<strong>Sample Input:</strong><br><pre><code>${meta.samples?.[0]?.input || "Not available."}</code></pre>` +
                              `<strong>Sample Output:</strong><br><pre><code>${meta.samples?.[0]?.output || "Not available."}</code></pre>`;
                          break;
                          case "hint1":
                          aiResponse = `<strong>Hint 1:</strong><br>${meta.hints?.hint1 || "Not available."}`;
                          break;
                          case "hint2":
                          aiResponse = `<strong>Hint 2:</strong><br>${meta.hints?.hint2 || "Not available."}`;
                          break;
                          case "both_hints":
                          aiResponse = `<strong>Hint 1:</strong><br>${meta.hints?.hint1 || "Not available."}<br><br>` +
                                      `<strong>Hint 2:</strong><br>${meta.hints?.hint2 || "Not available."}`;
                          break;
                          case "solution":
                          aiResponse = `<strong>Solution Approach:</strong><br>${meta.hints?.solution_approach || "Not available."}`;
                          break;
                          case "tags":
                          aiResponse = `<strong>Tags:</strong><br>` +
                                      (Array.isArray(meta.tags) ? meta.tags.join(", ") : "Not available.");
                          break;
                          case "body":
                          aiResponse = `<strong>Problem Statement:</strong><br>${meta.body || "Not available."}`;
                          break;
                      }
                  } else {
                      console.log("👉 problemId used:", currentProblemId);
                      aiResponse = await getAIResponse(message,currentProblemId);
                  }


                  // Create a container for the AI response
                  const botMessageDiv = document.createElement("div");
                  botMessageDiv.style.backgroundColor = COLORS.NAVY; // Highlighted background for AI response
                  botMessageDiv.style.color = "white"; // Dark text for contrast
                  botMessageDiv.style.padding = "10px";
                  botMessageDiv.style.margin = "5px 0";
                  botMessageDiv.style.borderRadius = "10px";
                  botMessageDiv.style.boxShadow = `0 2px 4px ${COLORS.DARK}`; // Subtle shadow for highlighting
                  botMessageDiv.style.textAlign = "left"; // Align bot response to the left
                  botMessageDiv.style.maxWidth = "70%"; // Optional: Limit the width of the message
                  botMessageDiv.style.marginRight = "auto"; // Align message to the left
                  botMessageDiv.innerHTML = aiResponse;

                  // Add the bot message to the container
                  const botMessageContainer = document.createElement("div");
                  botMessageContainer.style.display = "flex";
                  botMessageContainer.style.alignItems = "flex-end"; // Align bot message to the bottom of the container
                  botMessageContainer.appendChild(botMessageDiv);

                  // Add the AI response container to the messages container
                  messagesContainer.appendChild(botMessageContainer);
                  messagesContainer.scrollTop = messagesContainer.scrollHeight; // Auto-scroll to the latest message
                  
                  // if (window.currentProblemMeta && window.currentProblemMeta.data && window.currentProblemMeta.data.id) {
                  //     saveChatMessage(window.currentProblemMeta.data.id, 'ai', aiResponse);
                  // }

                  const typingIndicator = document.getElementById("typing-indicator");
                  if (typingIndicator) typingIndicator.remove();

                  if (!saveChatMessage(problemId, "user", message)) {
                    console.error("Failed to save user message");
                  }
                  
                  if (aiResponse && !saveChatMessage(problemId, "ai", aiResponse)) {
                    console.error("Failed to save AI response");
                  }

              } catch (error) {
                  console.error("Error fetching AI response:", error);

                  const errorMessageDiv = document.createElement("div");
                  errorMessageDiv.style.backgroundColor = "red";
                  errorMessageDiv.style.color = "white"; // High contrast for error messages
                  errorMessageDiv.style.padding = "10px";
                  errorMessageDiv.style.margin = "5px 0";
                  errorMessageDiv.style.borderRadius = "10px";
                  errorMessageDiv.style.textAlign = "left"; // Align error message to the left
                  errorMessageDiv.style.maxWidth = "70%"; // Optional: Limit the width of the message
                  errorMessageDiv.style.marginLeft = "10px"; // Add some margin to the left
                  errorMessageDiv.innerText = "Oops! Something went wrong. Please try again.";

                  messagesContainer.appendChild(errorMessageDiv);
                  messagesContainer.scrollTop = messagesContainer.scrollHeight; // Auto-scroll to the latest message

                  const typingIndicator = document.getElementById("typing-indicator");
                  if (typingIndicator) typingIndicator.remove();

              }
          }
          
        }
                
        sendButton.addEventListener("click", handleMessageSend);

        inputBox.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleMessageSend();
          }
        });
        
        
        
        

        inputContainer.appendChild(inputBox);
        inputContainer.appendChild(sendButton);

        // Append message area + input to inner container
        chatInner.appendChild(messagesContainer);
        chatInner.appendChild(inputContainer);

        // Then assemble final layout
        chatbox.appendChild(header);
        chatbox.appendChild(chatInner);

        addHistoryToolbar(chatbox, messagesContainer, currentProblemId);



        // Insert chatbox under the AI Helper button
        // Add to fixed position in body to stay persistent across SPA tab changes
        // Position relative to AI Helper button
        const leftSideContainer = document.querySelector("div.coding_leftside_scroll__CMpky");
        if (leftSideContainer) {
            // Remove any existing chatbox first
            const existingChatbox = document.getElementById("ai-chatbox");
            if (existingChatbox) {
                existingChatbox.remove();
            }
            
            // Add the new chatbox
            leftSideContainer.appendChild(chatbox);

            setTimeout(() => {
              const container = document.querySelector('.coding_leftside_scroll__CMpky');
              const box = document.getElementById("ai-chatbox");
              if (container && box && box.parentNode !== container) {
                container.appendChild(box);
              } else if (container && box) {
                container.appendChild(box); // move it to bottom
              }
            }, 50);
            
            // Hide other content
            setTabContentVisibility(false);
            
            // Scroll to bottom of messages
            const messagesContainer = chatbox.querySelector("#chat-messages");
            if (messagesContainer) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        } else {
            console.warn("❌ coding_leftside_scroll__CMpky container not found!");
        }
    } else {
        // Only for existing chatbox: toggle visibility
        const shouldShow = chatbox.style.display === "none";
        chatbox.style.display = shouldShow ? "block" : "none";
        setTabContentVisibility(!shouldShow);
    }

}



//2
// Function to observe DOM changes and add button when appropriate
function observePageChanges() {
    console.log("MutationObserver is active!");

    const targetNode = document.body; // Observe the entire body
    const config = { childList: true, subtree: true }; // Watch for added/removed nodes

    const observer = new MutationObserver(() => {
        // Check if we are on the /problem/* route
        // if (handleContentChange()) {
            
        //     console.log("innnnnn");
        //     addBookmarkButton(); // Add the button if we are on the correct route
        // }
        handleContentChange();
    });
    observer.observe(targetNode, config); // Start observing the DOM
}
function handleContentChange() {
    const pageChanged = isPageChange();

    if (onTargetPage()) {
        const existingButton = document.getElementById("ai-helper-button");

        // If full URL changed (like from / to /problems/123)
        if (pageChanged) {
            cleanUpPage();
            addInjectScript(); // ✅ You were right — we need this here
            console.log("🔁 Route changed → Insert button");
            addBookmarkButton();
        }
        // If button is missing (DOM wipe from React re-render, etc.)
        else if (!existingButton) {
            console.log("🔁 DOM changed → Button missing → Reinserting");
            addBookmarkButton();
        }
    } else {
        cleanUpPage(); // left problems page — remove button if still there
    }
}


function isPageChange(){
    const currChange = window.location.pathname;
    if(currChange ===  lastPageVisited) return false;

    lastPageVisited =currChange;
    return true;
}



// function onTargetPage(){
//     return window.location.pathname.startsWith('/problems/');
// }

function onTargetPage(){
    const  pathname = window.location.pathname;
    return pathname.startsWith('/problems/') && pathname.length > '/problems/'.length;
}

function cleanUpPage(){
    const  existingButton = document.getElementById("ai-helper-button");
    if(existingButton) existingButton.remove();
 
    const existingChatBot = document.getElementById("ai-chatbox");
    if(existingChatBot) existingChatBot.remove();
}


function getCurrentProblemId() {
  const pathMatch = window.location.pathname.match(/-(\d+)(?:\/|$)/);
  const idFromUrl = pathMatch ? pathMatch[1] : null;

  if (idFromUrl) return idFromUrl;

  if (window.currentProblemMeta?.data?.id) {
    return window.currentProblemMeta.data.id.toString();
  }

  const recent = localStorage.getItem('last_active_problem');
  return recent || null;
}


function getLocalStroageValueById(id){
    const key = `course_${userProfileData}_${id}_Java`;
    // const key = `course_28824_${id}_Java`;

    const value =localStorage.getItem(key);

    if(value !== null){
        console.log(`value for key "${key}":`, value);
    } else {
        console.log(`key "${key}" not found in localStorage`);
    }

    return value;
}

function addInjectScript(){
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js'); // Load from web_accessible_resources
    // script.onload = () => script.remove();
    document.documentElement.appendChild(script);
    document.head.appendChild(script);

}

// INJECT THE INJECT.JS

window.addEventListener("InterceptedRequest", (event) => {
  const { method, url, response } = event.detail;

  if (method === 'xhr') {
    const match = url.match(/\/problems\/user\/(\d+)/);

    if (match) {
      currentProblemId = match[1];

      try {
        window.currentProblemMeta = JSON.parse(response);
        console.log("✅ Loaded problem data for ID:", currentProblemId);
        console.log("🧠 Current problem:", window.currentProblemMeta);
      } catch (e) {
        console.error("❌ Failed to parse problem data:", e);
      }
    }
  }
  
});




window.debugAI = {
    getAIResponse,
    getAPIKey,
    saveChatMessage,
    loadChatHistory,
    buildConversationHistoryFromLocal
};

console.log("AI debug functions exposed. Access via window.debugAI");





