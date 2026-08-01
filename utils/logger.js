/**
 * Logger Utility
 * Conditionally logs based on environment
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

const logger = {
    log: (...args) => {
        if (isDevelopment) {
            console.log(...args);
        }
    },

    error: (...args) => {
        // Always log errors
        console.error(...args);
    },

    warn: (...args) => {
        if (isDevelopment) {
            console.warn(...args);
        }
    },

    info: (...args) => {
        if (isDevelopment) {
            console.info(...args);
        }
    },

    debug: (...args) => {
        if (isDevelopment && process.env.DEBUG === 'true') {
            console.debug(...args);
        }
    }
};

module.exports = logger;
