# Agenda Planner Workflow

Orchestrates specialized workers to generate personalized daily agendas.

## 1. Load User Memory

```yaml
call: workers/memory-manager
input:
  action: RETRIEVE
  userId: ${input.userId}
store: userMemory
```

## 2. Plan Daily Schedule

```yaml
call: workers/task-planner
input:
  tasks: ${input.tasks}
  events: ${input.events}
  preferences: ${input.preferences}
  date: ${input.date}
  constraints: ${input.constraints}
  userPatterns: ${artifacts.userMemory.patterns}
store: dailyPlan
```

## 3. Monitor Execution (conditional)

```yaml
condition: ${input.mode} == "EXECUTE"
call: workers/execution-monitor
input:
  plan: ${artifacts.dailyPlan.plan}
  tasks: ${input.tasks}
  userId: ${input.userId}
store: executionStatus
```

## 4. Reflect on Progress (conditional)

```yaml
condition: ${input.mode} == "REFLECT"
call: workers/reflection-analyzer
input:
  userId: ${input.userId}
  tasks: ${input.tasks}
  plan: ${artifacts.dailyPlan.plan}
  date: ${input.date}
store: reflectionInsights
```

## 5. Update Memory

```yaml
call: workers/memory-manager
input:
  action: STORE
  userId: ${input.userId}
  data:
    completedTasks: ${artifacts.executionStatus.completedTasks}
    insights: ${artifacts.reflectionInsights.patterns}
store: memoryUpdate
```

## 6. Assemble Final Output

```yaml
transform: assembleAgendaPlan
input:
  dailyPlan: ${artifacts.dailyPlan}
  executionStatus: ${artifacts.executionStatus}
  reflectionInsights: ${artifacts.reflectionInsights}
  userId: ${input.userId}
store: agendaPlan
```
