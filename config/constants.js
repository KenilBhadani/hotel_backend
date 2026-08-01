/**
 * Application Constants
 * Centralized configuration values
 */

module.exports = {
    // Pagination
    PAGINATION: {
        DEFAULT_LIMIT: 12,
        MAX_LIMIT: 100,
        ROOM_STATUS_LIMIT: 12,
        BOOKING_LIMIT: 20,
        TASK_LIMIT: 50
    },

    // Refresh Intervals (in milliseconds)
    REFRESH_INTERVALS: {
        ROOM_STATUS: 120000,      // 2 minutes
        NOTIFICATIONS: 60000,      // 1 minute
        DASHBOARD_STATS: 300000,   // 5 minutes
        TASK_LIST: 60000          // 1 minute
    },

    // Room Status
    ROOM_STATUS: {
        FREE: 'FREE',
        STAY: 'STAY',
        DIRTY: 'DIRTY',
        CLEANING: 'CLEANING',
        MAINTENANCE: 'MAINTENANCE',
        READY: 'READY',
        REVIEW: 'REVIEW'
    },

    // Booking Status
    BOOKING_STATUS: {
        PENDING: 'Pending',
        CONFIRMED: 'Confirmed',
        CHECKED_IN: 'Checked-in',
        CHECKED_OUT: 'Checked-out',
        CANCELLED: 'Cancelled'
    },

    // Payment Status
    PAYMENT_STATUS: {
        PAID: 'Paid',
        PENDING: 'Pending',
        CASH: 'Cash',
        FAILED: 'Failed'
    },

    // Task Status
    TASK_STATUS: {
        PENDING: 'Pending',
        IN_PROGRESS: 'In Progress',
        COMPLETED: 'Completed',
        CANCELLED: 'Cancelled'
    },

    // Task Priority
    TASK_PRIORITY: {
        LOW: 'Low',
        MEDIUM: 'Medium',
        HIGH: 'High'
    },

    // Task Category
    TASK_CATEGORY: {
        HOUSEKEEPING: 'Housekeeping',
        MAINTENANCE: 'Maintenance',
        OTHER: 'Other'
    },

    // Staff Roles
    STAFF_ROLES: {
        ADMIN: 'Admin',
        RECEPTIONIST: 'Receptionist',
        HOUSEKEEPING: 'Housekeeping',
        MAINTENANCE: 'Maintenance',
        MANAGER: 'Manager'
    },

    // Staff Shifts
    STAFF_SHIFTS: {
        MORNING: 'Morning',
        EVENING: 'Evening',
        NIGHT: 'Night'
    },

    // Room Types
    ROOM_TYPES: {
        SINGLE: 'Single',
        DOUBLE: 'Double',
        TWIN: 'Twin',
        DELUXE: 'Deluxe',
        SUITE: 'Suite',
        FAMILY: 'Family',
        STANDARD: 'Standard',
        EXECUTIVE: 'Executive',
        PRESIDENTIAL: 'Presidential'
    },

    // Room Number Prefixes
    ROOM_PREFIXES: {
        Single: 'S',
        Double: 'D',
        Twin: 'T',
        Deluxe: 'DX',
        Suite: 'SU',
        Family: 'F',
        Standard: 'ST',
        Executive: 'E',
        Presidential: 'P'
    },

    // JWT
    JWT: {
        EXPIRES_IN: '7d',
        COOKIE_EXPIRES: 7 * 24 * 60 * 60 * 1000 // 7 days
    },

    // Session
    SESSION: {
        MAX_AGE: 24 * 60 * 60 * 1000 // 1 day
    },

    // File Upload
    UPLOAD: {
        MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
        ALLOWED_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
        MAX_FILES: 10
    },

    // Currency
    CURRENCY: {
        DEFAULT: 'INR',
        SYMBOL: '₹'
    },

    // Validation
    VALIDATION: {
        PHONE_LENGTH: 10,
        PASSWORD_MIN_LENGTH: 6,
        NAME_MIN_LENGTH: 2,
        ROOM_NUMBER_START: 101
    }
};
