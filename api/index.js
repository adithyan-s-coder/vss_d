export default async function handler(req, res) {
    try {
        const module = await import('../backend/server.js');
        const app = module.default;
        return app(req, res);
    } catch (err) {
        console.error("VERCEL BOOT CRASH:", err);
        res.status(500).json({ 
            error: `Vercel Boot Crash: ${err.message}`, 
            stack: err.stack 
        });
    }
}
