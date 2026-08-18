import '../migration.js';
import '../auth-sync.js';
const { default: app } = await import('../server.js');
export default app;
