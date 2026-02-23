const fallbackLocalUrl = "http://192.168.1.50:8000";

// For Expo, define EXPO_PUBLIC_API_BASE_URL in mobile/.env
// Example:
// EXPO_PUBLIC_API_BASE_URL=http://192.168.1.50:8000
// EXPO_PUBLIC_API_BASE_URL=https://your-api.onrender.com
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || fallbackLocalUrl;
