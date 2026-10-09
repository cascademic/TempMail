// OpenAPI spec served at /api-docs
module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'TempMail API',
    version: '1.0.0',
    description: '1. Call `/api/auth/login` and copy the `token`.\n2. Click **Authorize** and paste the token.\n3. Call the email endpoints.',
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
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
          subject: { type: 'string', example: 'Your verification code' },
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
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login and get a JWT token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: { type: 'string', example: 'anshul.madan' },
                  password: { type: 'string', example: 'P@ssw0rd' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Logged in',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    token: { type: 'string' },
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        username: { type: 'string' },
                        email: { type: 'string' },
                        isAdmin: { type: 'boolean' },
                        isApproved: { type: 'boolean' },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: 'Missing username or password', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          401: { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          403: { description: 'Account pending admin approval', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/email/latest': {
      get: {
        tags: ['Email'],
        summary: 'Get the latest message for an email address (includes OTP)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'email', in: 'query', required: true, schema: { type: 'string' }, example: 'test@tempmail.duckdns.org' },
        ],
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
          400: { description: 'email missing', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          401: { description: 'Missing or invalid token', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          404: { description: 'No messages for this email yet', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
  },
};
