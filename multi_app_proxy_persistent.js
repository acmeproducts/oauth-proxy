
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

// Persistent token store using local JSON file
const TOKEN_FILE = 'tokens.json';

function loadTokens() {
    if (fs.existsSync(TOKEN_FILE)) {
        return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    }
    return {};
}

function saveTokens(tokens) {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}

function storeToken(appId, refreshToken) {
    const tokens = loadTokens();
    tokens[appId] = refreshToken;
    saveTokens(tokens);
}

function getStoredToken(appId) {
    const tokens = loadTokens();
    return tokens[appId] || null;
}

// Config (static client credentials)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Auth endpoint
app.get('/auth', (req, res) => {
    const { app: appId, redirect } = req.query;
    if (!appId || !redirect) return res.status(400).send('Missing app or redirect');
    const state = encodeURIComponent(`${appId}|${redirect}`);
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=https://oauth-proxy-3idr.onrender.com/google/callback&response_type=code&scope=https://www.googleapis.com/auth/drive&access_type=offline&prompt=consent&state=${state}`;
    res.redirect(url);
});

// Callback endpoint
app.get('/google/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!state) return res.status(400).send('Missing state');
    const [appId, redirect] = decodeURIComponent(state).split('|');
    try {
        const tokenRes = await axios.post('https://oauth2.googleapis.com/token', null, {
            params: {
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: `https://oauth-proxy-3idr.onrender.com/google/callback`,
                grant_type: 'authorization_code'
            }
        });
        storeToken(appId, tokenRes.data.refresh_token);
        console.log(`Stored refresh token for app: ${appId}`);
        res.redirect(redirect);
    } catch (err) {
        console.error(err.response?.data || err);
        res.status(500).send('Error obtaining tokens');
    }
});

// Refresh endpoint
app.get('/refresh', async (req, res) => {
    const { app: appId } = req.query;
    const refreshToken = getStoredToken(appId);
    if (!appId || !refreshToken) return res.status(400).send('No refresh token stored for this app');
    try {
        const tokenRes = await axios.post('https://oauth2.googleapis.com/token', null, {
            params: {
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            }
        });
        res.json(tokenRes.data);
    } catch (err) {
        console.error(err.response?.data || err);
        res.status(500).send('Error refreshing token');
    }
});

app.listen(PORT, () => console.log(`Production-grade proxy running on port ${PORT}`));
