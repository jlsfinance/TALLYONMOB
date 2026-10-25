const getUpstreamBaseUrl = () => {
    const rawBaseUrl = String(process.env.JLS_API_BASE_URL || process.env.VITE_JLS_API_BASE_URL || '').trim();
    return rawBaseUrl ? rawBaseUrl.replace(/\/$/, '') : '';
};

const readRequestBody = (req) => {
    if (!req.body) {
        return {};
    }

    if (typeof req.body === 'string') {
        try {
            return JSON.parse(req.body);
        } catch {
            return {};
        }
    }

    return req.body;
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).json({ error: 'Missing Authorization header' });
    }

    const upstreamBaseUrl = getUpstreamBaseUrl();
    if (!upstreamBaseUrl) {
        return res.status(503).json({ error: 'Billing handoff service is not configured' });
    }

    try {
        const upstreamResponse = await fetch(`${upstreamBaseUrl}/api/handoff/create`, {
            method: 'POST',
            headers: {
                Authorization: authorization,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(readRequestBody(req)),
        });

        const contentType = upstreamResponse.headers.get('content-type') || '';
        const rawBody = await upstreamResponse.text();

        if (contentType.includes('application/json')) {
            if (!rawBody) {
                return res.status(upstreamResponse.status).json({});
            }

            try {
                return res.status(upstreamResponse.status).json(JSON.parse(rawBody));
            } catch {
                return res.status(upstreamResponse.status).send(rawBody);
            }
        }

        return res.status(upstreamResponse.status).send(rawBody);
    } catch (error) {
        console.error('Billing handoff proxy failed:', error);
        return res.status(502).json({ error: 'Failed to reach billing handoff service' });
    }
}