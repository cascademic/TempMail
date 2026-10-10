// OpenAPI spec served at /api-docs
const errorResponse = (description) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

const credentialsBody = {
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['username', 'password', 'email'],
        properties: {
          username: { type: 'string', example: 'your_username' },
          password: { type: 'string', example: 'your_password' },
          email: { type: 'string', example: 'test@tempmail.duckdns.org', description: 'Temp email to read' },
        },
      },
    },
  },
};

const commonErrors = {
  400: errorResponse('username, password, or email missing'),
  401: errorResponse('Invalid credentials'),
  403: errorResponse('Account pending admin approval'),
};

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'TempMail API',
    version: '1.0.0',
    description: 'Send `username`, `password`, and `email` in the JSON body. No token needed.',
  },
  servers: [{ url: '/' }],
  components: {
    schemas: {
      Error: {
        type: 'object',
        properties: { error: { type: 'string' } },
      },
      Message: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          temp_email_id: { type: 'string', format: 'uuid' },
          sender: { type: 'string', example: 'no-reply@example.com' },
          recipient: { type: 'string', example: 'test@tempmail.duckdns.org' },
          subject: { type: 'string', example: 'One Time Password: DP world Trade Finance' },
          body_text: { type: 'string' },
          body_html: { type: 'string', nullable: true },
          otp: { type: 'string', nullable: true, example: '482913' },
          received_at: { type: 'string', format: 'date-time' },
          size_bytes: { type: 'integer' },
        },
      },
    },
  },
  paths: {
    '/api/email/latest': {
      post: {
        tags: ['Email'],
        summary: 'Get the latest message for an email',
        requestBody: credentialsBody,
        responses: {
          200: {
            description: 'Latest message',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { $ref: '#/components/schemas/Message' },
                  },
                },
              },
            },
          },
          ...commonErrors,
          404: errorResponse('No messages for this email yet'),
        },
      },
    },
    '/api/email/get-otp': {
      post: {
        tags: ['Email'],
        summary: 'Get the 6-digit OTP from the latest "One Time Password: DP world Trade Finance" mail',
        requestBody: credentialsBody,
        responses: {
          200: {
            description: 'OTP found',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    otp: { type: 'string', example: '482913' },
                  },
                },
              },
            },
          },
          ...commonErrors,
          404: errorResponse('No messages, latest message is not the OTP mail, or no OTP in it'),
        },
      },
    },
  },
};
