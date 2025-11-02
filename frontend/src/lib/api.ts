const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const url = `${API_URL}${endpoint}`;
  
  console.log('🔵 API Request:', url); // Debug log
  
  const defaultOptions: RequestInit = {
    credentials: 'include', // Important for cookies/sessions
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, { ...defaultOptions, ...options });
    
    console.log('🟢 API Response:', response.status); // Debug log
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }
    
    return response.json();
  } catch (error) {
    console.error('🔴 API Error:', error);
    throw error;
  }
}

// Test function
export async function testConnection() {
  return apiRequest('/auth/user/');
}