
interface LogPayload {
  service: string;
  model?: string;
  prompt?: any;
  config?: any;
  response?: any;
  error?: any;
  responseBody?: any;
}

export const logAiInteraction = (payload: LogPayload) => {
  const timestamp = new Date().toISOString();
  console.groupCollapsed(`[${timestamp}] AI Log: ${payload.service}`);
  
  if (payload.response) {
    console.log(`%c[SUCCESS]`, 'color: #28a745', 'Service:', payload.service);
    console.log('Response Data:', payload.response);
  } else if (payload.error) {
    console.log(`%c[ERROR]`, 'color: #dc3545', 'Service:', payload.service);
    console.log('Error:', payload.error);
    if (payload.responseBody) {
        console.log('Raw Response Body:', payload.responseBody);
    }
  } else {
    console.log(`%c[REQUEST]`, 'color: #17a2b8', 'Service:', payload.service);
    console.log('Model:', payload.model);
    console.log('Prompt/Contents:', payload.prompt);
    if (payload.config) {
      console.log('Config:', payload.config);
    }
  }
  console.groupEnd();
};
