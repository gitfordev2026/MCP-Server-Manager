import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/access-policies', () =>
    HttpResponse.json({
      policies: {
        'mcp:test': {
          defaultMode: 'approval',
          endpointModes: {},
        },
      },
    })
  ),

  http.put('/access-policies/:ownerId/:endpointId', () =>
    HttpResponse.json({}, { status: 200 })
  ),
];
