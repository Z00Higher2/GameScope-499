
(() => {
    console.log("GameScope Steam Library: Scanner started.");

    // ==========================================
    // Steam account detection
    // ==========================================

    function extractSteamId() {
        const profileLinks = [
            ...document.querySelectorAll(
                'a[href*="steamcommunity.com/profiles/"]'
            )
        ];

        for (const link of profileLinks) {
            const match = link.href.match(
                /steamcommunity\.com\/profiles\/(\d{17})/
            );

            if (match) {
                return match[1];
            }
        }

        // Try the logged-in Steam profile link.
        const profileLink = document.querySelector(
            "#global_action_menu a[href*='/profiles/']"
        );

        if (profileLink) {
            const match = profileLink.href.match(
                /\/profiles\/(\d{17})/
            );

            if (match) return match[1];
        }

        return null;
    }

    // ==========================================
    // Normalize Steam's relative last-played dates
    // ==========================================

    function normalizeLastPlayed(value) {
        if (!value) return null;

        const cleaned = value.trim();

        if (!cleaned) return null;

        const today = new Date();

        // Use local calendar dates to avoid timezone shifts.
        function formatDate(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");

            return `${year}-${month}-${day}`;
        }

        const lower = cleaned.toLowerCase();

        if (lower === "today") {
            return formatDate(today);
        }

        if (lower === "yesterday") {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            return formatDate(yesterday);
        }

        const daysAgo = lower.match(/^(\d+)\s+days?\s+ago$/);

        if (daysAgo) {
            const date = new Date(today);
            date.setDate(date.getDate() - Number(daysAgo[1]));
            return formatDate(date);
        }

        // Handle dates Steam already provides.
        const parsed = new Date(cleaned);

        if (!Number.isNaN(parsed.getTime())) {
            return formatDate(parsed);
        }

        // Preserve unrecognized text instead of discarding it.
        return cleaned;
    }

    // ==========================================
    // Extract playtime
    // ==========================================

    function extractPlaytime(cardText) {
        const match = cardText.match(
            /TOTAL PLAYED\s*:?\s*([\d,.]+)\s*(hours?|hrs?|minutes?|mins?)/i
        );

        if (!match) return 0;

        const amount = parseFloat(
            match[1].replace(/,/g, "")
        );

        const unit = match[2].toLowerCase();

        return unit.startsWith("hour") || unit.startsWith("hr")
            ? Math.round(amount * 60)
            : Math.round(amount);
    }

    // ==========================================
    // Extract last-played information
    // ==========================================

    function extractLastPlayed(cardText) {
        const match = cardText.match(
            /LAST PLAYED\s*:?\s*([^\n\r]+)/i
        );

        if (!match) return null;

        return normalizeLastPlayed(match[1]);
    }

    // ==========================================
    // Extract owned Steam games
    // ==========================================

    function extractGames() {
        const links = document.querySelectorAll(
            'a[href*="store.steampowered.com/app/"]'
        );

        const games = [];
        const seen = new Set();

        links.forEach((link) => {
            const name = link.textContent.trim();

            if (!name || name === "Store Page") return;

            const match = link.href.match(
                /\/app\/(\d+)/
            );

            if (!match) return;

            const appId = match[1];

            if (seen.has(appId)) return;

            const card = link.closest('div[role="button"]');

            if (!card) return;

            const cardText = card.innerText || "";

            const playtimeMinutes = extractPlaytime(cardText);
            const lastPlayed = extractLastPlayed(cardText);

            const imageElement = card.querySelector("img");

            const image = imageElement
                ? imageElement.src
                : null;

            games.push({
                appId,
                name,
                playtimeMinutes,
                lastPlayed,
                image
            });

            seen.add(appId);
        });

        return games;
    }

    // ==========================================
    // Scan Steam library
    // ==========================================

    function scanLibrary() {
        const steamId = extractSteamId();

        if (!steamId) {
            console.error(
                "GameScope: Could not identify the logged-in Steam account."
            );

            return {
                success: false,
                error: "Could not identify your Steam account. Make sure you are logged in."
            };
        }

        const games = extractGames();

        console.log("GameScope Steam ID:", steamId);
        console.log("GameScope: Games detected:", games.length);
        console.table(games);

        const playedToday = games.filter(
            (game) => game.lastPlayed === normalizeLastPlayed("Today")
        );

        console.log(
            "GameScope: Games played today:",
            playedToday.length
        );

        if (playedToday.length > 0) {
            console.table(playedToday);
        }

        chrome.runtime.sendMessage(
            {
                type: "STEAM_GAMES_FOUND",
                steamId,
                games
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error(
                        "GameScope extension error:",
                        chrome.runtime.lastError.message
                    );
                }
            }
        );

        return {
            success: true,
            steamId,
            gameCount: games.length,
            games
        };
    }

    // ==========================================
    // Handle scan requests from background.js
    // ==========================================

    chrome.runtime.onMessage.addListener(
        (message, sender, sendResponse) => {
            if (message.type === "SCAN_STEAM_LIBRARY") {
                console.log(
                    "GameScope requested a Steam library scan."
                );

                setTimeout(() => {
                    const result = scanLibrary();
                    sendResponse(result);
                }, 2000);

                return true;
            }
        }
    );

    // Initial scan when the Steam library opens.
    setTimeout(() => {
        scanLibrary();
    }, 2000);
})();
