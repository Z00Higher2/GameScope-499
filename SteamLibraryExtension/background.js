
// ==========================================
// GameScope Steam Library Extension
// ==========================================

const STEAM_LIBRARY_URL =
    "https://steamcommunity.com/my/games/?tab=all";

const ALLOWED_ORIGINS = [
    "https://gamescope-five.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173"
];

// Open the user's Steam library when the extension icon is clicked.
chrome.action.onClicked.addListener(async () => {
    try {
        await chrome.tabs.create({
            url: STEAM_LIBRARY_URL
        });
    } catch (error) {
        console.error("GameScope: Unable to open Steam.", error);
    }
});

// ==========================================
// Internal extension messages
// ==========================================

chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
        if (message.type === "STEAM_GAMES_FOUND") {
            console.log(
                "GameScope received Steam ID:",
                message.steamId
            );

            console.log(
                "GameScope received Steam games:",
                message.games
            );

            console.table(message.games);

            sendResponse({
                success: true,
                steamId: message.steamId,
                gameCount: Array.isArray(message.games)
                    ? message.games.length
                    : 0
            });
        }

        return true;
    }
);

// ==========================================
// Wait for a Steam tab to finish loading
// ==========================================

function waitForTab(tabId) {
    return new Promise((resolve, reject) => {
        let completed = false;

        const finish = (error = null) => {
            if (completed) return;

            completed = true;
            chrome.tabs.onUpdated.removeListener(listener);

            if (error) {
                reject(error);
            } else {
                resolve();
            }
        };

        const listener = (updatedTabId, changeInfo) => {
            if (
                updatedTabId === tabId &&
                changeInfo.status === "complete"
            ) {
                finish();
            }
        };

        chrome.tabs.onUpdated.addListener(listener);

        chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError) {
                finish(
                    new Error(
                        chrome.runtime.lastError.message
                    )
                );
                return;
            }

            if (tab?.status === "complete") {
                finish();
            }
        });
    });
}

// ==========================================
// Request a scan from the Steam content script
// ==========================================

function scanSteamTab(tabId) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(
            tabId,
            {
                type: "SCAN_STEAM_LIBRARY"
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    reject(
                        new Error(
                            "Could not communicate with the Steam scanner. " +
                            "Refresh the Steam library page and try again."
                        )
                    );
                    return;
                }

                if (!response || response.success !== true) {
                    reject(
                        new Error(
                            response?.error ||
                            "Steam library scan failed."
                        )
                    );
                    return;
                }

                if (
                    !response.steamId ||
                    !Array.isArray(response.games)
                ) {
                    reject(
                        new Error(
                            "Steam did not return a valid account ID and game list."
                        )
                    );
                    return;
                }

                if (response.games.length === 0) {
                    reject(
                        new Error(
                            "No Steam games were detected. Make sure your Steam library is visible and try again."
                        )
                    );
                    return;
                }

                resolve({
                    success: true,
                    steamId: response.steamId,
                    gameCount: response.games.length,
                    games: response.games
                });
            }
        );
    });
}

// ==========================================
// Retrieve the user's Steam library
// ==========================================

async function requestSteamLibrary() {
    const tabs = await chrome.tabs.query({
        url: "https://steamcommunity.com/my/games/*"
    });

    let steamTab = tabs.find(
        (tab) => typeof tab.id === "number"
    );

    let createdTab = false;

    // Open Steam in the background if there is no existing library tab.
    if (!steamTab) {
        steamTab = await chrome.tabs.create({
            url: STEAM_LIBRARY_URL,
            active: false
        });

        createdTab = true;
    }

    if (typeof steamTab.id !== "number") {
        throw new Error(
            "Could not open the Steam library."
        );
    }

    const tabId = steamTab.id;

    try {
        // Wait for Steam to finish loading.
        await waitForTab(tabId);

        // Give Steam time to render the game cards.
        await new Promise((resolve) => {
            setTimeout(resolve, 2500);
        });

        // Ask content.js to scan and return the actual game list.
        return await scanSteamTab(tabId);

    } finally {
        // Close only the temporary tab created for this import.
        // Never close an existing Steam library tab.
        if (createdTab) {
            try {
                await chrome.tabs.remove(tabId);
            } catch (error) {
                console.warn(
                    "GameScope: Could not close temporary Steam tab.",
                    error
                );
            }
        }
    }
}

// ==========================================
// Messages from the GameScope website
// ==========================================

chrome.runtime.onMessageExternal.addListener(
    (message, sender, sendResponse) => {

        // Only allow requests from GameScope.
        if (!ALLOWED_ORIGINS.includes(sender.origin)) {
            sendResponse({
                success: false,
                error: "Unauthorized website."
            });

            return;
        }

        // Check whether the extension is installed.
        if (message.type === "GAMESCOPE_PING") {
            sendResponse({
                success: true,
                installed: true,
                extension: "GameScope Steam Library"
            });

            return;
        }

        // Retrieve the user's Steam library.
        if (message.type === "GAMESCOPE_IMPORT_STEAM_LIBRARY") {
            requestSteamLibrary()
                .then((result) => {
                    console.log(
                        "GameScope: Successfully retrieved Steam library.",
                        result.gameCount,
                        "games."
                    );

                    sendResponse({
                        success: true,
                        steamId: result.steamId,
                        gameCount: result.gameCount,
                        games: result.games
                    });
                })
                .catch((error) => {
                    console.error(
                        "GameScope Steam import error:",
                        error
                    );

                    sendResponse({
                        success: false,
                        error: error instanceof Error
                            ? error.message
                            : "Unable to retrieve your Steam library."
                    });
                });

            // Keep the message channel open for the async response.
            return true;
        }

        return false;
    }
);
