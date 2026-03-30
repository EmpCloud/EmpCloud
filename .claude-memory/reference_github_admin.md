---
name: GitHub admin operations (issue deletion, tokens)
description: How to bulk-delete GitHub issues via GraphQL, token permissions needed, and the batch script pattern
type: reference
---

## Deleting GitHub Issues

GitHub REST API does NOT support issue deletion. Must use **GraphQL `deleteIssue` mutation**.

### Requirements
- Token must have **Administration: Read and write** permission (fine-grained) OR **repo + admin:org** scopes (classic)
- User must be **org owner** (admin role), not just member
- Token owner: `sumitempcloud` account has owner access to EmpCloud org

### GraphQL Delete Pattern
```bash
TOKEN="ghp_..."
# Get node_id from REST API
NODE_ID=$(curl -s -H "Authorization: token $TOKEN" "https://api.github.com/repos/EmpCloud/EmpCloud/issues/NUMBER" | python -c "import sys,json; print(json.load(sys.stdin).get('node_id',''))")

# Delete via GraphQL
curl -s -X POST -H "Authorization: bearer $TOKEN" -H "Content-Type: application/json" \
  "https://api.github.com/graphql" \
  -d "{\"query\": \"mutation { deleteIssue(input: {issueId: \\\"$NODE_ID\\\"}) { repository { name } } }\"}"
```

### Bulk Delete (batch pattern)
1. Fetch all issue node IDs (100 per page, paginate with `?state=open&per_page=100&page=N`)
2. Save to file: `/tmp/all_issue_ids.txt`
3. Loop with `while read NODE_ID` and call GraphQL per issue
4. Rate: ~100 issues/minute sequentially, can parallelize batches (101-400, 401-700, etc.)
5. Successfully deleted 1,189 issues with 0 failures on 2026-03-29

### Token Types
- `gho_...` (sumitglobussoft) — pull-only, can comment, CANNOT close/delete
- `ghp_...` (sumitempcloud) — full admin, can comment + close + delete (with owner role)
