# Building an Incident Triage Agent: What It Taught Me About Writing AI Agents

There is a kind of alert fatigue which does not look dramatic from outside. Dashboards are still green enough. People are still responding. Incidents are still getting resolved. But inside the team, attention is slowly becoming expensive.

That is where this agent started for me.

We had too many noisy alerts. Some alerts were real, some were repeating, some were caused by monitor configuration, and some were just the same chronic condition firing every twenty or thirty minutes. The dangerous part was not only the noise. The dangerous part was that real alerts were getting suppressed by the habit of ignoring the noisy ones.

I did not want an agent that fixes production by itself. That is too much trust in the wrong place. What I wanted first was simpler: every alert should receive a disciplined first investigation. It should look at the monitor, check recent deployments, search logs, inspect cloud state, and write down what it found. If there is no evidence, it should say there is no evidence. If a query returned zero results, it should not pretend that means the system is healthy.

This is how the incident triage agent began.

## The First Version Was Just a Loop

One term is useful before talking about agents: a tool. Think of a tool like an API endpoint exposed to the model. In a normal API you may have `get_users`: it accepts some input and returns users. A tool is similar: `search_logs` accepts a query and returns matching logs, `get_recent_deploys` returns deploy information, `write_report` writes the final report. The difference is that the tool definition gives the model more visibility: the name, description, input schema, and expected behavior are all shown to it. The model does not execute the tool by itself. It asks for the tool with structured input, and the application validates that request and runs the real code.

In pseudocode, a tool looks something like this:

```ts
const searchLogs = tool({
  name: 'search_logs',
  description: 'Search application logs for a time window',
  input: {
    query: 'string',
    from: 'iso_timestamp',
    to: 'iso_timestamp',
  },
  run: async ({ query, from, to }) => {
    return boundedLogSearch(query, from, to);
  },
});
```

The first useful lesson is that an agent is not magic. At the core, it is a loop.

You give the model a goal and some context. The model asks to use a tool. Your code validates the tool input, runs the tool, and sends the result back to the model. Then the model decides the next step. This continues until the model writes the final answer, or until your budget says stop.

In rough shape, it is this:

```text
messages = [user_goal]

for turn in 1..max_turns:
  response = model(messages, tools)

  if response.tool_request:
    result = run_tool(response.tool_request)
    messages.append(result)
    continue

  return response.final_answer

return "stopped: max turns reached"
```

The real TypeScript shape was not much more complicated. Simplified, it looked like this:

```ts
// Start the conversation with the alert or task the agent must investigate.
const messages = [{ role: 'user', content: userPrompt }];

// Keep a fast lookup so a model-requested tool name maps to real code.
const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

for (let turn = 0; turn < maxTurns; turn++) {
  // Ask the model what to do next, while showing it the available tools.
  const response = await model.messages.create({
    model: modelId,
    system: systemPrompt,
    messages,
    tools: tools.map(toModelToolSchema),
  });

  // Preserve the assistant response so the next turn has full context.
  messages.push({ role: 'assistant', content: response.content });

  // If the model is done, return the final answer/report.
  if (response.stop_reason === 'end_turn') {
    return { status: 'done' };
  }

  const toolResults = [];

  // Find every tool call the model requested in this turn.
  for (const request of findToolRequests(response.content)) {
    const tool = toolsByName.get(request.name);

    // Validate model-generated input before it reaches real systems.
    const input = tool.inputSchema.parse(request.input);

    // Run the actual application code behind the tool.
    const output = await tool.run(input);

    // Send the tool output back in the format the model expects.
    toolResults.push({
      type: 'tool_result',
      tool_use_id: request.id,
      content: JSON.stringify(output),
    });
  }

  // Continue the loop with the evidence gathered from tools.
  messages.push({ role: 'user', content: toolResults });
}

// The agent did not finish within the allowed number of turns.
return { status: 'max_turns' };
```

The loop above passes `systemPrompt` and `userPrompt` into the model but never shows them. They are just text. The system prompt sets the agent's overall behavior:

```text
You are an incident triage agent. You investigate one Datadog alert and write an
evidence-based report. You can read systems, but you cannot change them.

- Investigate before you conclude: read the monitor, check recent deploys, search
  logs and spans, inspect cloud state.
- A query that returns zero results is not proof the system is healthy.
- Never present a correlation as a proven root cause.
- If you cannot prove something, write it down as a data gap.
- When you have enough evidence, call write_report once and stop.
```

And the user prompt was just the alert itself, turned into text:

```text
Investigate this Datadog alert.

Monitor:    checkout-api p99 latency
Monitor ID: 12345678
Service:    checkout-api
Triggered:  2026-06-22 14:02 UTC
Query:      p99 of trace.http.request, service:checkout-api > 2s
State:      ALERT
```

That is the whole input. Behavior in the system prompt, the specific alert in the user prompt, and the tools listed alongside.

My first implementation was almost exactly this raw loop. It had more error handling, tracing, timeout logic, and report tracking, but the core idea was the same: call the model, parse tool requests, run the tools, append tool results, and repeat.

It also had the boring but important parts: maximum iterations, wall-clock timeout, tool execution traces, and a final report written to object storage. That was the point where it could run on an alert and leave something useful behind.

That first version was not beautiful, but it was honest. It showed the real shape of an agent. The model was not "running code". The model was choosing actions. The application was still responsible for validating and executing everything.

## Agent, Skills, and Tools Are Different Layers

Once the loop was working, I needed a better way to name the layers.

I had the agent, I had tools, and then there was all the operational judgment in between. At first it all felt like "the prompt". But that became too vague. Some instructions were really about the agent's overall behavior. Some were reusable investigation habits. Some were actual function calls.

The agent is the whole thing. In this case, it is the incident triage agent. It receives the alert, decides what to inspect, tracks the budget, uses memory when it helps, writes the report, and stops. The agent owns the overall behavior.

A skill is more like a reusable way of doing one part of that work. For this agent, a skill could describe how to investigate a Datadog monitor, how to write an evidence-based report, or how to handle a recurring alert without blindly copying the last conclusion. Most of that is not code. It is markdown, rules, examples, and local knowledge.

A tool is the part that actually runs. `search_logs` can query logs. `get_recent_deploys` can ask GitLab what changed. `inspect_aws_resource` can read cloud state. `write_report` can save markdown to object storage. The model can request those tools, but the application validates the input and executes the real code.

The relationship is simple:

```text
agent = owns the goal and control loop
skill = teaches a reusable way to do part of the work
tool  = executes a specific deterministic action
```

The zero-result recovery behavior is a good example. The log search tool only knows how to search logs. It does not know that empty results are suspicious in our environment. The skill is what tells the agent what to do next: try a broader search, check spans instead of logs, verify the time window, inspect tags versus attributes, and record a data gap if the evidence is still missing.

Concretely, that skill is just a markdown file that wraps the search tools with local knowledge. It is about how to use those tools well, not a standalone trick. Notice that zero-result recovery is only one step inside it:

```markdown
---
name: query-datadog-logs
description: How to use the Datadog tools to find evidence in this environment.
---

The tools only run the queries you give them. Querying well in this environment
is the skill. Everything below is a verified pattern or a verified trap.

## Tools

- datadog_get_monitor — fetch the monitor query and current state; always run first
- datadog_search_events — check the 24h re-trigger pattern (flapping vs new incident)
- datadog_baseline_probe — one-shot probe that returns the real service tag,
  stage/env key, functionname prefix, and attribute namespace for a Lambda service
- datadog_search_logs — raw log retrieval; default storage_tier flex_and_indexes
- datadog_aggregate_logs — grouped counts (errors by functionname, volume by stage)
- datadog_search_spans — APM spans; fallback when logs are not indexed or you need
  resource-name filtering
- datadog_aggregate_spans — grouped counts over spans (5xx by resource_name)
- datadog_query_metric — timeseries grouped by tag; ground truth for infra alerts

## Before the first log query

Call playbook_get_service_facts first. If it misses, run datadog_baseline_probe
to discover: the real service tag, stage/env tag key and values, functionname
prefix, attributeNamespace. Record the result with playbook_record_service_facts.
The alert's service tag is often the APM service name, not the log facet value.

## Five hard query rules

1. Always pass storage_tier flex_and_indexes. The hot tier ("indexes" alone)
   returns 0 silently for most projects in this org, even at now-1h.
2. For any value lookup, start with _:<value>. Do not guess @custom.<path>.
   Powertools fields land under @custom._ but the nested path varies by handler.
   \*:<value> finds the log; then read the real path off it.
3. Tags are bare; attributes are @-prefixed. service:, stage:, env:,
   functionname:, host: are tags. @custom.traceId, @custom.data.body.message
   are attributes. Mixing these up produces silent zeros.
4. Use functionname:_<handler>_ to filter Lambda logs. The attribute
   @aws.lambda.function_name does not exist on Forwarder-forwarded logs.
5. @custom._ attributes are not faceted in this org. @custom.traceId:foo
   returns 0 even when the value is present. Use _:<value> instead. Verified.

## Population routing

Three populations that cannot be mixed in one query:

Lambda runtime logs (service:hpe-_): filter by functionname:_<handler>\*. Never
use path: or resource: here — those are APM span facets and do not exist on log
documents. The Forwarder does not emit them.

API Gateway access logs: query source:apigateway path:"<full-path>" and drop
the service: filter entirely. Access logs are not tagged with the Lambda service
name, so service: always returns 0 on this population.

APM spans (datadog_search_spans / datadog_aggregate_spans): use when logs are
not indexed, or when you need resource_name filtering. HPE handlers return 4xx
and 5xx via APIGatewayResponse, so the span stays status:ok for HTTP errors.
Filter @http.status_code:[400 TO 599] for HTTP errors; use status:error only for
thrown exceptions.

## Metric localization

For an infra or ratio alert (ALB, API Gateway, Lambda error-rate), run
datadog_query_metric grouped by tag before searching logs or spans. Example for
an ALB alert:

sum:aws.applicationelb.httpcode_target_5xx{name:<alb>} by {targetgroup}.as_count()

The series with the highest value is the responsible resource. Logs from a target
group that is not carrying the signal are not evidence for this alert, regardless
of their volume. Use the metric as ground truth before attributing a cause.

## Recovery ladder (when a query returns 0)

Do not iterate alternate values of the same filter. Probe to find the broken key.

0. Check the population first. If the query contains resource:, path:, or a URL
   string starting with "/" — those facets do not exist on log documents. Route
   to the correct population (spans for resource:, access logs for path:) before
   touching any other filter.

Then work through these in order until results appear:

a. Replace @<attr>:<value> with _:<value>. If results appear, read the real
attribute path off the returned log.
b. Swap stage/env key. stage:qa <-> env:uat. The dual-tag mismatch (a log
carries both, but the query uses the wrong key) is the most common cause of
silent zeros in this org.
c. Drop the status: filter.
d. Drop the functionname:_<handler>\* filter.
e. Drop the env/stage filter entirely.
f. Widen the time window: now-7d, then now-30d (flex_and_indexes only).
g. Drop service:<resolved>. If still 0, fall back to datadog_search_spans.

The first removal that produces results identifies the broken key. Update
playbook_record_service_facts with what you find.

## traceId cross-service tracing

traceId is the platform correlation id. Format: <prefix>\_<apiGwRequestId>.
To follow one request across services:

\*:<traceId> (storage_tier flex_and_indexes, now-7d, sort ascending)

Do not add a service: filter — it hides the other hops. Do not use
@custom.traceId:<value> — that attribute is not indexed as a facet and always
returns 0. Aggregate the results by service and functionname to reconstruct the
call path. See read_reference_doc('trace-id') for the full note.
```

Skills like this live on the filesystem as markdown, and a runner can load them alongside the tools. With the Claude Agent SDK, for example, that wiring looks like this (real code, unlike the pseudocode above):

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

for await (const message of query({
  prompt: 'Investigate this Datadog alert and write an evidence-based report',
  options: {
    cwd: '/path/to/project', // Project with .claude/skills/
    settingSources: ['user', 'project'], // Load Skills from filesystem
    skills: 'all', // Enable every discovered Skill
    allowedTools: ['search_logs', 'get_recent_deploys', '...'],
  },
})) {
  console.log(message);
}
```

This distinction helped. I did not need one giant prompt forever. The skills carried the judgment patterns. The tools carried the execution.

## Making It Useful Means Giving It the Right Tools

A general chatbot is weak during an incident. It can explain what a 5xx is, or suggest generic debugging steps, but it cannot know what happened in your system unless you give it the tools.

The triage agent became useful only when the tools became useful.

Tools gave the agent access to systems. Skills taught it what to try first, what to distrust, and when to admit a gap.

The tool set grew around the real workflow of an engineer looking at an alert:

- Read the Datadog monitor and understand the exact query that fired.
- Search logs, spans, events, and metrics inside the alert window.
- Check recent commits, merge requests, pipelines, and production deployments in GitLab.
- Inspect cloud resources with read-only AWS commands.
- Look at OpenSearch when a service depended on indexed data.
- Read reference notes and stored playbook facts.
- Save a final markdown report.

The important design choice was that these tools were read-only. The agent could not restart services, change monitors, scale infrastructure, rerun pipelines, or modify Datadog state. It could investigate and write a report. That was enough for version one, and it kept the trust boundary clean.

Every tool also needed a budget. This is a very practical thing. If a log search returns one megabyte of raw JSON, the model will waste tokens and still miss the point. So the tools returned bounded summaries. They accepted explicit time windows. They logged latency and success. They validated input. They failed closed where possible.

The practical version is more constrained: let the model call this specific log search tool with a fixed schema, default storage tier, maximum output size, and clear error behavior. That constraint is what makes the results easier to trust.

## The First Hard Lesson: Observability Data Lies When You Query It Wrong

The first versions were sometimes wrong in a very normal engineering way. They would search logs, get zero results, and treat that as evidence.

But here's the catch. In our environment, zero results usually did not mean nothing happened.

> A query that returns zero results is not evidence of a healthy system. Most of the time it just means you asked the wrong question.

Maybe the alert had a service tag that did not match the service tag on runtime logs. Maybe the logs were in a cheaper storage tier and not in the hot index. Maybe the thing I was looking for was a span attribute, not a log attribute. Maybe a URL path existed only in API Gateway access logs, while Lambda runtime logs used function names. Maybe an attribute was wrapped under a different namespace than expected.

I started turning those scars into instructions, tests, and tool behavior. A zero-result query was no longer allowed to mean "nothing happened" by default. The agent had to recover. It had to change the population first: logs versus spans, API access logs versus runtime logs, tags versus attributes. It had to try broader searches for exact values before guessing field paths. It had to record the data gap if it still could not find evidence.

The recovery rule was simple in spirit:

```text
if log_search returns 0:
  check the population first
  try spans instead of logs
  try broader exact-value search
  widen the time window
  report the data gap if still empty
```

This is a pattern I now think is central to building agents. You do not improve them only by changing models. You improve them by turning production failure modes into explicit instructions, tests, tools, and memory.

The instructions grew because production kept teaching me small painful details.

## The Agent Needed Memory, But Not Too Much

After the agent had enough tools, the next problem was repetition.

Some monitors kept firing for the same reason. The agent could spend ten or fifteen minutes on a full investigation, write a good report, and then do almost the same work again on the next firing. Did you notice the problem? That is wasteful, and it is also not how a human would behave. A human would say, "I have seen this monitor already. Let me first check if this looks like the same pattern."

So the agent got memory in two forms. Monitor memory saves a short summary for each monitor: likely cause, key evidence, and suggested next step. Playbook memory records Datadog query shapes that actually produced evidence for a service and alert category, so future investigations can start from what already worked.

Memory made the agent faster. But the thing is, it also introduced a new risk. If you trust memory too much, the agent will copy old conclusions forward forever — and that is not investigation anymore, it is just automation of a stale belief.

The recurrence logic was added to control this. If a monitor fires many times in a recent window and prior summaries agree, the agent can take a fast path. It performs one cheap check that the current firing matches the known signature, optionally checks that no relevant deployment landed, then writes an abbreviated report.

The shape is not complicated:

```text
if same_monitor_fired_many_times:
  load previous summaries
  confirm this firing matches the known pattern
  check no deploy landed in the window
  write abbreviated report
else:
  run full investigation
```

But after several consecutive fast-path triages, the fast path is disabled and the agent must perform a full investigation again. This is important. A chronic alert can change. A noisy monitor can hide a new real incident.

> Memory should reduce duplicate work, not remove skepticism.

## But How Do You Give an Agent Memory?

So how do you actually give an agent memory?

In my case, memory was just another set of tools.

That sounds almost too simple, but it is the useful mental model. The model does not automatically remember every past run. The application gives it tools that can save small records and query those records later. Those tools talk to a datastore. The agent sees them the same way it sees `search_logs` or `write_report`.

A save tool can look like this:

```ts
const saveMonitorMemory = tool({
  name: 'save_monitor_memory',
  description: 'Save a short summary for a monitor after an investigation.',
  input: {
    monitor_id: 'string',
    summary: 'string',
    evidence: 'string',
    suggested_next_step: 'string',
  },
  run: async (memory) => {
    await datastore.put({
      key: `monitor/${memory.monitor_id}`,
      value: memory,
    });

    return { saved: true };
  },
});
```

And a query tool does the other half:

```text
query_monitor_memory(monitor_id)
  -> previous summaries
  -> known signatures
  -> useful prior queries
```

The important part is what you choose to store. I did not want the agent saving raw unbounded logs or copying whole reports back into the next run. The memory record had to be small: what happened, what evidence supported it, what query worked, and what should be checked next time.

Then the instructions tell the agent how to use that memory. Look at prior summaries first. Treat them as a starting point, not as proof. Confirm the current firing still matches the old pattern. If it does not match, ignore the shortcut and investigate normally.

In other words, memory was capability plus instruction. The datastore held the facts and the tools exposed save and query, but the part that actually mattered was the skill — it decided how much the agent should trust what came back.

## Moving From Hand-Rolled Loop to Claude Tool Runner

The first raw typescript loop contained a lot of protocol plumbing.

Every model response had to be inspected. Tool-use blocks had to be decoded. Tool results had to be formatted exactly right. Partial responses and token limits needed special handling. None of this was the actual product. The product was the investigation.

Later, the agent moved to Claude's helper tool runner through an internal LLM gateway. This did not change the basic idea. The for loop was still there conceptually. The model still selected tools. The application still executed them. The agent still stopped when it had enough evidence or when the budget ended.

What changed was the amount of code needed to manage the conversation protocol. The tool runner let the code define runnable tools directly, with schemas beside the handlers. Around it, the application still added production concerns: timeouts, iteration limits, telemetry, token usage, estimated cost, and prompt caching.

In a simplified form, that version looks like this:

```ts
import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

const client = new Anthropic({ baseURL: process.env.ANTHROPIC_BASE_URL, apiKey });

const tools = [
  betaZodTool({
    name: 'search_logs',
    description: 'Search application logs for a time window',
    inputSchema: z.object({ query: z.string() }),
    run: async ({ query }) => boundedLogSearch(query),
  }),
];

const runner = client.beta.messages.toolRunner({
  model: process.env.MODEL_ID,
  max_tokens: 8192,
  messages: [{ role: 'user', content: 'Investigate this alert' }],
  tools,
  max_iterations: 20,
});

// Iterate the runner to accumulate token usage per turn and inject a wrap-up
// nudge before the iteration budget runs out.
for await (const message of runner) {
  accumulateUsage(message.usage);
  if (nearBudget(iter)) runner.pushMessages(wrapUpNudge);
}
```

This is how I think about frameworks for agents now. They do not remove the need to understand the loop. If you do not understand the loop, you will not understand failures. But once you understand it, a helper runner is useful because it lets you spend less time on protocol mechanics and more time on the behavior that matters.

## Saving the Report Is Also a Tool

The same idea applies to the final report. The agent does not save a markdown file because the prompt asks nicely. The prompt can say what should happen, but the actual write still needs to be a tool. In my case, that tool was `write_report`.

It still has a boring name, a useful description, and a strict input schema. The implementation owns the real side effect.

```ts
const writeReport = tool({
  name: 'write_report',
  description: 'Write the final investigation report as markdown.',
  input: {
    markdown: 'string',
  },
  run: async ({ markdown }) => {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const key = `triage/${ctx.service}/${ctx.alertId}/${timestamp}.md`;

    await s3.send(
      new PutObjectCommand({
        Bucket: ctx.reportsBucket,
        Key: key,
        Body: markdown,
        ContentType: 'text/markdown; charset=utf-8',
      }),
    );

    return `s3://${ctx.reportsBucket}/${key}`;
  },
});
```

Then the instructions tell the agent when to call it: write the report once, include the required sections, and stop after the write succeeds.

```text
At the end of the investigation, call write_report exactly once.
The report must include Summary, Likely cause, Evidence, Data gaps, and Suggested next steps.
After write_report, stop.
```

A finished report ends up looking roughly like this:

```markdown
## Summary

Monitor "checkout-api p99 latency" fired at 14:02 UTC. Latency rose from
~180ms to ~2.4s for about 6 minutes, then recovered on its own.

## Likely cause (confidence: MEDIUM)

A deploy of checkout-api (MR !1423, deployed 13:58 UTC) shipped a change to
the payment client. The latency spike starts ~3 minutes after the deploy and
overlaps with a burst of timeouts to the payments upstream.

## Evidence

- GitLab: MR !1423 deployed to prod at 13:58 UTC, touches payment_client.ts.
- Spans: p99 on POST /checkout climbs from 13:59, peak 2.4s at 14:02.
- Logs: 41 "payments upstream timeout" entries between 13:59–14:05, none before.

## Data gaps

- Could not confirm whether the upstream itself degraded; no access to its
  dashboards from this agent. Treated as correlation, not root cause.

## Suggested next steps

- Have a human compare MR !1423's timeout/retry settings against prod defaults.
- If confirmed, consider rollback or a follow-up fix to the payment client.

---

## Triage metadata

- Model: `claude-sonnet-4-6`
- Duration: 47s
- Iterations: 6 (stop reason: end_turn)
- Token usage: 40,519 total — input 38,412 / output 2,107 / cache write 0 / cache read 0
- Estimated cost: $0.14 (USD, claude-sonnet-4-6 pricing)

### Tool usage

| Tool                   | Calls | Total time | Bytes returned |
| ---------------------- | ----- | ---------- | -------------- |
| datadog_search_logs    | 2     | 8.1s       | 42.3 KB        |
| datadog_search_spans   | 1     | 3.2s       | 21.8 KB        |
| datadog_get_monitor    | 1     | 1.4s       | 4.2 KB         |
| gitlab_prod_deployment | 1     | 2.6s       | 9.8 KB         |
| write_report           | 1     | 0.3s       | —              |
```

Notice what the report does not do: it does not declare a root cause it cannot
prove, and it states the gap explicitly. That discipline comes from the skill, not
the tool.

This is the same pattern as memory. The instruction defines the behavior. The tool gives the agent the capability. The application owns the side effect.

## Guardrails Are Where the Trust Comes From

The trust in this kind of agent comes from guardrails.

Some guardrails are obvious: read-only tools, output budgets, maximum turns, wall-clock timeouts, and a required final report. The agent can investigate and write what it found, but it cannot mutate production. Tools return bounded summaries instead of raw dumps. If the agent cannot prove something, the report must say that as a gap.

One guardrail I liked a lot was the wrap-up interjection. Agents can keep investigating because every tool result creates another question. A hard max-iteration limit controls cost, but it can also stop the run before the report is written. So near the end of the budget, the application injects a message telling the model to stop gathering and produce the artifact.

```text
if turn == max_turns - 3:
  messages.append({
    role: "user",
    content: "You are almost out of iterations. Stop investigating now. Use the evidence you have, save memory if needed, write the report, and end."
  })
```

That small intervention changed the behavior. Instead of just running out of turns and dying at the edge of its budget, the agent learned to wrap up properly: save the memory worth keeping, write the report, and make the uncertainty visible before it stops.

## The System Around the Agent Matters

The architecture around the agent was simple on purpose.

A Datadog monitor sends an alert to a notification topic. The message lands in a queue. A long-running container polls the queue. For each alert, it parses the payload, resolves the service and monitor, loads secrets, builds the tool context, runs the agent, writes a markdown report to object storage, and optionally sends a notification to chat with a link to the report.

The path is intentionally boring:

```text
Datadog alert
    -> notification topic
    -> queue
    -> poller service
    -> agent + tools
    -> markdown report
    -> chat notification
```

Around this there is infrastructure that nobody should ignore:

- A dead-letter queue for messages that cannot be processed.
- A visibility timeout long enough for investigation.
- Startup smoke tests so the service does not enter the poll loop when all tools are broken.
- Terraform-managed infrastructure.
- Read-only roles for cloud inspection.
- CI checks, unit tests, and focused tests for prompts, parsing, tools, recurrence, and notifications.
- Metadata appended to reports: model, duration, token usage, estimated cost, and tool trace.

This plumbing matters because it makes the work repeatable. Each alert follows the same path, and failures have somewhere visible to land.

One thing I like about this design is that it leaves artifacts. The report is stored, linked, and reviewable after the incident. It can show which tools were called and where the evidence came from. Agents will be wrong sometimes, so their work must be inspectable.

## Where Agents Fit in Software Engineering

I do not think agents replace senior engineers.

I think agents fit best where the work is bounded, repetitive, evidence-driven, and tool-rich. Incident triage is a good example. A first responder often follows a familiar pattern: read the alert, check the monitor, inspect recent deploys, search logs, compare metrics, look at resource state, write a summary. The judgment is hard, but the shape of the work is stable.

An agent can do the first pass. It can gather the boring evidence while engineers are still opening laptops. It can notice repeated patterns. It can make sure every alert gets at least a minimum investigation. It can write down gaps instead of letting them disappear in chat.

But the agent should not be given unlimited authority. It should not mutate production just because it found one suspicious log line. And it should never dress a correlation up as a proven root cause, or bury its own uncertainty because a confident answer reads better. A confident wrong answer is worse than an honest "I could not prove this."

The future I find more believable is not "agents replace engineers." It is more like this: engineers build small, specialized agents around their systems. These agents know the tools, topology, deployment path, observability traps, and local rules. They do first-pass work and preserve context.

The next natural step is shared engineering intelligence across code, services, and operations. Incident triage should be able to ask, "Which service owns this route?" A PR review agent should ask, "What production dependencies does this change touch?" These questions need citations, graph relationships, and live operational context.

That is where agents become useful in software engineering: not one giant assistant, but narrow systems with good tools and strict evidence rules.

## What I Would Tell Someone Building One

- Spend more time on tools and skills than on clever system prompting. A good tool decides what the agent can see. A good skill decides how it uses what it sees.
- Add memory carefully. It should reduce duplicate work, not repeat old conclusions forever.
- Measure the agent. Track tool calls, duration, token usage, cost, and failure reasons.

Refine it longer than feels exciting. I did not get a good agent by writing the first loop and stopping there. I kept reading real reports, finding where they were wrong, thin, too confident, or wasting time, and then pushed those lessons back into the system. That refinement took weeks. I stopped only when, reading through the reports myself, the large majority of them held up as a useful first-pass investigation rather than something I had to redo by hand.

That refinement was not one thing. It was everything:

- Prompt instructions.
- Tool schemas and output budgets.
- Datadog query recovery.
- Report format.
- Monitor memory and fast-path rules.
- Tests around edge cases.
- Telemetry, cost, and failure reasons.

Finally, accept that building an agent is mostly normal software engineering. There is a model in the middle, yes. But the hard parts are still boundaries, data quality, failure modes, observability, tests, deployment, and feedback loops. That is good news. We already know many of the skills needed to build useful agents. We just need to apply them with discipline.
