const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// Config
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GITHUB_PAT = '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';
const GITHUB_REPO = 'acmeproducts/oauth-proxy';
const GITHUB_FILE = 'tokens.json';

async function getGithubFile() {
    try {
        const res = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`, {
            headers: { 'Authorization': `token ${GITHUB_PAT}` }
        });
        const content = Buffer.from(res.data.content, 'base64').toString('utf8');
        return { content: JSON.parse(content), sha: res.data.sha };
    } catch (err) {
        if (err.response && err.response.status === 404) {
            return { content: {}, sha: null };
        }
        throw err;
    }
}

async function updateGithubFile(content, sha) {
    const encoded = Buffer.from(JSON.stringify(content, null, 2)).toString('base64');
    await axios.put(`https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`, {
        message: 'Update tokens.json',
        content: encoded,
        sha: sha || undefined
    }, {
        headers: { 'Authorization': `token ${GITHUB_PAT}` }
    });
}

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
        const { content, sha } = await getGithubFile();
        content[appId] = tokenRes.data.refresh_token;
        await updateGithubFile(content, sha);
        console.log(`Stored refresh token for app: ${appId} in GitHub`);
        res.redirect(redirect);
    } catch (err) {
        if (err.response) {
            console.error('Google error data:', JSON.stringify(err.response.data, null, 2));
            res.status(500).send(`Error obtaining tokens: ${JSON.stringify(err.response.data)}`);
        } else {
            console.error('Unknown error:', err);
            res.status(500).send('Unknown error');
        }
    }
});

// Refresh endpoint
app.get('/refresh', async (req, res) => {
    const { app: appId } = req.query;
    try {
        const { content } = await getGithubFile();
        if (!content[appId]) return res.status(400).send('No refresh token stored for this app');
        const tokenRes = await axios.post('https://oauth2.googleapis.com/token', null, {
            params: {
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                refresh_token: content[appId],
                grant_type: 'refresh_token'
            }
        });
        res.json(tokenRes.data);
    } catch (err) {
        console.error(err.response?.data || err);
        res.status(500).send('Error refreshing token');
    }
});

app.listen(PORT, () => console.log(`GitHub-backed proxy running on port ${PORT}`));
