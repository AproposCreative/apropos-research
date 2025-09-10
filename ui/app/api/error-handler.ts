// Global error handler for API routes
export function handleApiError(error: any, context: string = 'API') {
  console.error(`${context} Error:`, error);
  
  // Handle specific error types
  if (error.name === 'AbortError') {
    return { error: 'Request timeout', status: 408 };
  }
  
  if (error.code === 'ETIMEDOUT') {
    return { error: 'Connection timeout', status: 408 };
  }
  
  if (error.code === 'ENOTFOUND') {
    return { error: 'Host not found', status: 404 };
  }
  
  if (error.code === 'ECONNREFUSED') {
    return { error: 'Connection refused', status: 503 };
  }
  
  // Generic error
  return { error: 'Internal server error', status: 500 };
}
