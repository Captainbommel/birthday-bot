// Mock for OpenAI API
const MockOpenAI = jest.fn().mockImplementation((config) => {
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