module.exports = async function handler(req, res) {
  try {
    const { generateText } = await import('ai');

    const result = await generateText({
      model: 'openai/gpt-6-astra',
      prompt: 'Reply with exactly ASTRA_OK and nothing else.',
      maxOutputTokens: 64
    });

    return res.status(200).json({
      ok: true,
      model: 'openai/gpt-6-astra',
      text: result.text,
      finishReason: result.finishReason,
      usage: result.usage
    });
  } catch (error) {
    const status = error?.statusCode || error?.status || 500;
    return res.status(status).json({
      ok: false,
      error: String(error?.message || error),
      name: error?.name,
      statusCode: error?.statusCode,
      cause: error?.cause ? String(error.cause) : undefined
    });
  }
};
