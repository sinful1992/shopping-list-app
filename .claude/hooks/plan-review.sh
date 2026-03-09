#!/bin/bash
INPUT=$(cat)
echo "$INPUT" | node -e "
const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString());
    const msg = data.last_assistant_message || '';
    if (msg.includes('PLAN_REVIEW_READY')) {
      process.stderr.write(
        'Roast this plan. Search the codebase for everything it could break — ' +
        'callers of modified functions, dependents on changed data, missing migrations or Firebase rule updates, edge cases, duplicate functionality. ' +
        'For each issue found, mark it clearly as: 🔴 **ISSUE:** <what is wrong and why>. ' +
        'Fix the plan to address each issue, and mark each fix inline in the plan as: 🟢 **FIX:** <what was added or changed>. ' +
        'If issues were found and fixed AND this is review pass 1, 2, or 3: output PLAN_REVIEW_READY at the end of your message to trigger another review pass. Do NOT show the plan to the user yet. ' +
        'If issues were found and this is review pass 4 or more: stop reviewing, show the user the plan with all unresolved issues marked 🔴, and ask: These issues could not be fully resolved after 4 review passes. How would you like to proceed? ' +
        'If no issues were found: show the user the final reviewed plan with a brief summary of what was checked. Say exactly: Type approve to implement, or reject with your concern.\n'
      );
      process.exit(2);
    }
    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
});
"
