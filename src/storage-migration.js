// Imported first by app.js so every module reads the migrated keys.
import {migrateLegacyStorage} from './app-id.js';
migrateLegacyStorage();
