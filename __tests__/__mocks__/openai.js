// Mock for OpenAI API
const { mock, jest } = require('bun:test');

const MockOpenAI = mock((config) => {
    const mockChatCompletions = jest.fn();

    // Default successful response
    const defaultResponse = {
        choices: [{
            message: {
                content: "Wieder ein Jahr älter und immer noch genauso verrückt! 😄"
            }
        }]
    };
    
    // Set default behavior
    mockChatCompletions.mockResolvedValue(defaultResponse);
    
    return {
        apiKey: config.apiKey,
        chat: {
            completions: {
                create: mockChatCompletions
            }
        }
    };
});

module.exports = MockOpenAI;