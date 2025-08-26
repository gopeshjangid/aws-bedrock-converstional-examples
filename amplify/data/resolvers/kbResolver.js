export function request(ctx) {
  const { input } = ctx.args;

  console.log("knowledge base triggred", ctx)
  return {
    resourcePath: "/knowledgebases/SB77W32JWL/retrieve",
    method: "POST",
    params: {
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        retrievalQuery: {
          text: input,
        },
      }),
    },
  };
}

export function response(ctx) {
  return JSON.stringify(ctx.result.body);
}