import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { google } from "@ai-sdk/google";
import { auth } from "@clerk/nextjs/server";

const suggestionSchema = z.object({
    suggestion: z
    .string()
    .describe("The code to insert at cursor, or empty string if no completion needed.")
});

const SUGGESTION_PROMPT = `You are an expert, highly strict code completion assistant. Your sole purpose is to output the exact string of characters to be inserted at the cursor position. 

<context>
<file_name>{fileName}</file_name>
<previous_lines>
{previousLines}
</previous_lines>
<current_line number="{lineNumber}">
<before_cursor>{textBeforeCursor}</before_cursor>|<after_cursor>{textAfterCursor}</after_cursor>
</current_line>
<next_lines>
{nextLines}
</next_lines>
<full_code>
{code}
</full_code>
</context>

<instructions>
Evaluate the following conditions IN ORDER:

1. Look at <next_lines>. If it contains any code that logically continues from where the cursor is (represented by the | symbol), output nothing. The code is already written.
2. Look at <before_cursor>. If it ends with a complete statement termination (e.g., ;, }, )), output nothing.
3. If steps 1 and 2 do not apply, suggest the exact characters that should be typed at the cursor position, using <full_code> to understand the surrounding logic.

CRITICAL OUTPUT CONSTRAINTS:
- Your suggestion is inserted immediately after the cursor. Never duplicate code that already exists in <before_cursor>, <after_cursor>, or <next_lines>.
- Output ONLY the raw code suggestion.
- DO NOT wrap your output in markdown code blocks (e.g., do not use \`\`\`).
- DO NOT output any conversational text, greetings, or explanations.
- If your evaluation results in no suggestion, return an absolutely empty string with no spaces or newlines.
</instructions>`;

export async function POST(request: Request) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 403 }
            );
        }

        const {
            fileName,
            code,
            currentLine,
            previousLines,
            testBeforeCursor,
            textAfterCursor,
            nextLines,
            lineNumber
        } = await request.json();
    
        if (!code) {
            return NextResponse.json({ error: "Code is required" }, { status: 400 });
        }

        const prompt = SUGGESTION_PROMPT
        .replace("{fileName}", fileName)
        .replace("{code}", code)
        .replace("{currentLine}", currentLine)
        .replace("{previousLines}", previousLines || "")
        .replace("{testBeforeCursor}", testBeforeCursor)
        .replace("{textAfterCursor}", textAfterCursor)
        .replace("{nextLines}", nextLines || "")
        .replace("{lineNumber}", lineNumber.toString());

        const { output } = await generateText({
            model: google("gemini-2.5-flash"),
            output: Output.object({ schema: suggestionSchema }),
            prompt
        });

        return NextResponse.json({ suggestion: output.suggestion });
    } catch (error) {
        console.error("Suggestion error: ", error);
        return NextResponse.json(
            { error: "Failed to generate suggestion" },
            { status: 500 }
        );
    }
};