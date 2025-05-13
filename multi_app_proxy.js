const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// In-memory token store (replace with persistent store if needed)
const tokenStore = {};

// Config
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PROXY_BASE_URL = 'https://oauth-proxy-3idr.onrender.com'; // Your actual Render URL

// Dynamic Google Auth flow with app and redirect
app.get('/auth', (req, res) => {
    const { app: appId, redirect } = req.query;
    if (!appId || !redirect) return res.status(400).send('Missing app or redirect');
    const state = encodeURIComponent(`${appId}|${redirect}`);
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${PROXY_BASE_URL}/callback&response_type=code&scope=https://www.googleapis.com/auth/drive&access_type=offline&prompt=consent&state=${state}`;
    res.redirect(url);
});

// Callback with state to associate token to app
app.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!state) return res.status(400).send('Missing state');
    const [appId, redirect] = decodeURIComponent(state).split('|');
    try {
        const tokenRes = await axios.post('https://oauth2.googleapis.com/token', null, {
            params: {
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: `${PROXY_BASE_URL}/callback`,
                grant_type: 'authorization_code'
            }
        });
        tokenStore[appId] = tokenRes.data.refresh_token;
        console.log(`Stored refresh token for app: ${appId}`);
        res.redirect(redirect);
    } catch (err) {
        console.error(err.response?.data || err);
        res.status(500).send('Error obtaining tokens');
    }
});

// Refresh token per app
app.get('/refresh', async (req, res) => {
    const { app: appId } = req.query;
    if (!appId || !tokenStore[appId]) return res.status(400).send('No refresh token stored for this app');
    try {
        const tokenRes = await axios.post('https://oauth2.googleapis.com/token', null, {
            params: {
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                refresh_token: tokenStore[appId],
                grant_type: 'refresh_token'
            }
        });
        res.json(tokenRes.data);
    } catch (err) {
        console.error(err.response?.data || err);
        res.status(500).send('Error refreshing token');
    }
});

app.listen(PORT, () => console.log(`Multi-app proxy running on port ${PORT}`));
