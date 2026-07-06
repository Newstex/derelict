import { describe, it, expect, beforeEach } from 'vitest';
import { QuestLog, QuestStatus, Quest, QuestTemplateType } from '../src/systems/QuestSystem';
import { DialogueSystem, NPCDialogue, DialogueTree } from '../src/systems/DialogueSystem';

describe('DialogueSystem', () => {
  it('should start and end dialogue', () => {
    const ds = new DialogueSystem();
    const tree: DialogueTree = {
      startId: 'n1',
      nodes: {
        n1: { id: 'n1', speaker: 'NPC', text: 'Hello!', choices: [], next: 'n1' },
      },
    };
    const npc = new NPCDialogue('npc1', 'Test NPC', '', tree);
    ds.start(npc);
    expect(ds.isActive).toBe(true);
    expect(ds.currentNode?.text).toBe('Hello!');
    ds.end();
    expect(ds.isActive).toBe(false);
  });

  it('should handle branching choices', () => {
    const ds = new DialogueSystem();
    const tree: DialogueTree = {
      startId: 'n1',
      nodes: {
        n1: {
          id: 'n1',
          speaker: 'NPC',
          text: 'Choose:',
          choices: [
            { text: 'Option A', next: 'a' },
            { text: 'Option B', next: 'b' },
          ],
        },
        a: { id: 'a', speaker: 'NPC', text: 'You chose A', choices: [], next: null },
        b: { id: 'b', speaker: 'NPC', text: 'You chose B', choices: [], next: null },
      },
    };
    const npc = new NPCDialogue('npc1', 'Test NPC', '', tree);
    let lastText = '';
    ds.onNode.on((evt) => { lastText = evt.node.text; });
    ds.start(npc);
    ds.select(0);
    expect(lastText).toBe('You chose A');
  });
});

describe('QuestLog', () => {
  let ql: QuestLog;

  function makeQuest(id: string, objectiveCount: number = 2): Quest {
    const objectives = [];
    for (let i = 0; i < objectiveCount; i++) {
      objectives.push({ id: `obj_${i}`, description: `Objective ${i + 1}`, completed: false, progress: 0, target: 1 });
    }
    return {
      id,
      title: `Test Quest ${id}`,
      description: 'A test quest',
      status: QuestStatus.Inactive,
      objectives,
      rewards: { xp: 100, credits: 50, items: [] },
    };
  }

  beforeEach(() => {
    ql = new QuestLog();
  });

  it('should add and start a quest', () => {
    const quest = makeQuest('q1');
    ql.add(quest);
    ql.start('q1');
    expect(quest.status).toBe(QuestStatus.Active);
    expect(ql.active.length).toBe(1);
  });

  it('should complete objectives and quest', () => {
    const quest = makeQuest('q1', 2);
    ql.add(quest);
    ql.start('q1');
    ql.progressObjective('q1', 'obj_0', 1);
    expect(quest.objectives[0].completed).toBe(true);
    expect(quest.status).toBe(QuestStatus.Active);
    ql.progressObjective('q1', 'obj_1', 1);
    expect(quest.status).toBe(QuestStatus.Completed);
    expect(ql.completed.length).toBe(1);
  });

  it('should not complete quest with incomplete objectives', () => {
    const quest = makeQuest('q1', 3);
    ql.add(quest);
    ql.start('q1');
    ql.progressObjective('q1', 'obj_0', 1);
    expect(quest.status).toBe(QuestStatus.Active);
    expect(ql.completed.length).toBe(0);
  });

  it('should fail a quest', () => {
    const quest = makeQuest('q1');
    ql.add(quest);
    ql.start('q1');
    ql.fail('q1');
    expect(quest.status).toBe(QuestStatus.Failed);
    expect(ql.failed.length).toBe(1);
  });

  it('should look up quests', () => {
    const quest = makeQuest('q1');
    ql.add(quest);
    expect(ql.get('q1')).toBe(quest);
    expect(ql.get('unknown')).toBeUndefined();
    expect(ql.has('q1')).toBe(true);
    expect(ql.has('unknown')).toBe(false);
  });

  it('should track all/active/completed/failed', () => {
    const q1 = makeQuest('q1');
    const q2 = makeQuest('q2');
    const q3 = makeQuest('q3');
    ql.add(q1); ql.add(q2); ql.add(q3);
    ql.start('q1'); ql.start('q2');
    ql.fail('q2');
    expect(ql.all.length).toBe(3);
    expect(ql.active.length).toBe(1);
    expect(ql.failed.length).toBe(1);
    expect(ql.completed.length).toBe(0);
  });
});