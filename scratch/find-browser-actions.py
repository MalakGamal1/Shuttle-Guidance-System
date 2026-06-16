import json

log_file = "/home/malak/.gemini/antigravity-ide/brain/95c28d83-d3c2-47f8-bd4d-1620e8b17b2f/.system_generated/logs/transcript.jsonl"

with open(log_file, 'r') as f:
    for line in f:
        if '"name":"browser_subagent"' in line:
            try:
                data = json.loads(line)
                print(f"Step {data.get('step_index')}:")
                for tc in data.get("tool_calls", []):
                    if tc.get("name") == "browser_subagent":
                        print("  Task:", tc.get("args", {}).get("Task"))
            except Exception as e:
                pass
