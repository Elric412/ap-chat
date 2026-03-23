import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { transformOpenCode } from '../../../scripts/lib/transformers/opencode.js';
import { parseFrontmatter } from '../../../scripts/lib/utils.js';

const TEST_DIR = path.join(process.cwd(), 'test-tmp-opencode');

describe('transformOpenCode', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  test('should create correct directory structure', () => {
    transformOpenCode([], TEST_DIR);
    expect(fs.existsSync(path.join(TEST_DIR, 'opencode/.opencode/skills'))).toBe(true);
  });

  test('should create skill with full frontmatter', () => {
    const skills = [
      {
        name: 'test-skill',
        description: 'A test skill',
        license: 'MIT',
        body: 'Skill instructions.'
      }
    ];

    transformOpenCode(skills, TEST_DIR);

    const outputPath = path.join(TEST_DIR, 'opencode/.opencode/skills/test-skill/SKILL.md');
    expect(fs.existsSync(outputPath)).toBe(true);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = parseFrontmatter(content);

    expect(parsed.frontmatter.name).toBe('test-skill');
    expect(parsed.frontmatter.description).toBe('A test skill');
    expect(parsed.frontmatter.license).toBe('MIT');
    expect(parsed.body).toBe('Skill instructions.');
  });

  test('should add user-invocable flag for user-invocable skills', () => {
    const skills = [
      {
        name: 'audit',
        description: 'Audit command',
        userInvocable: true,
        body: 'Audit the code.'
      }
    ];

    transformOpenCode(skills, TEST_DIR);

    const content = fs.readFileSync(path.join(TEST_DIR, 'opencode/.opencode/skills/audit/SKILL.md'), 'utf-8');
    const parsed = parseFrontmatter(content);

    expect(parsed.frontmatter['user-invocable']).toBe(true);
  });

  test('should not add user-invocable flag for non-user-invocable skills', () => {
    const skills = [
      {
        name: 'helper',
        description: 'Helper skill',
        body: 'Helper body.'
      }
    ];

    transformOpenCode(skills, TEST_DIR);

    const content = fs.readFileSync(path.join(TEST_DIR, 'opencode/.opencode/skills/helper/SKILL.md'), 'utf-8');
    const parsed = parseFrontmatter(content);

    expect(parsed.frontmatter['user-invocable']).toBeUndefined();
  });

  test('should include args in frontmatter', () => {
    const skills = [
      {
        name: 'with-args',
        description: 'Command with args',
        userInvocable: true,
        args: [
          { name: 'target', description: 'Target element', required: false }
        ],
        body: 'Process {{target}}.'
      }
    ];

    transformOpenCode(skills, TEST_DIR);

    const content = fs.readFileSync(path.join(TEST_DIR, 'opencode/.opencode/skills/with-args/SKILL.md'), 'utf-8');
    const parsed = parseFrontmatter(content);

    expect(parsed.frontmatter.args).toBeArray();
    expect(parsed.frontmatter.args).toHaveLength(1);
    expect(parsed.frontmatter.args[0].name).toBe('target');
  });

  test('should not include args when empty', () => {
    const skills = [
      {
        name: 'no-args',
        description: 'No args',
        userInvocable: true,
        args: [],
        body: 'Simple body.'
      }
    ];

    transformOpenCode(skills, TEST_DIR);

    const content = fs.readFileSync(path.join(TEST_DIR, 'opencode/.opencode/skills/no-args/SKILL.md'), 'utf-8');
    const parsed = parseFrontmatter(content);

    expect(parsed.frontmatter.args).toBeUndefined();
  });

  test('should include allowed-tools in frontmatter', () => {
    const skills = [
      {
        name: 'test',
        description: 'Test',
        allowedTools: 'Bash,Edit',
        body: 'Body'
      }
    ];

    transformOpenCode(skills, TEST_DIR);

    const content = fs.readFileSync(path.join(TEST_DIR, 'opencode/.opencode/skills/test/SKILL.md'), 'utf-8');
    expect(content).toContain('allowed-tools: Bash,Edit');
  });

  test('should include compatibility in frontmatter', () => {
    const skills = [
      {
        name: 'test',
        description: 'Test',
        compatibility: 'opencode',
        body: 'Body'
      }
    ];

    transformOpenCode(skills, TEST_DIR);

    const content = fs.readFileSync(path.join(TEST_DIR, 'opencode/.opencode/skills/test/SKILL.md'), 'utf-8');
    expect(content).toContain('compatibility: opencode');
  });

  test('should include metadata in frontmatter', () => {
    const skills = [
      {
        name: 'test',
        description: 'Test',
        metadata: 'some-metadata',
        body: 'Body'
      }
    ];

    transformOpenCode(skills, TEST_DIR);

    const content = fs.readFileSync(path.join(TEST_DIR, 'opencode/.opencode/skills/test/SKILL.md'), 'utf-8');
    expect(content).toContain('metadata: some-metadata');
  });

  test('should handle multiple skills', () => {
    const skills = [
      { name: 'skill1', description: 'Skill 1', body: 'Body 1' },
      { name: 'skill2', description: 'Skill 2', body: 'Body 2' },
      { name: 'skill3', description: 'Skill 3', body: 'Body 3' }
    ];

    transformOpenCode(skills, TEST_DIR);

    expect(fs.existsSync(path.join(TEST_DIR, 'opencode/.opencode/skills/skill1/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(TEST_DIR, 'opencode/.opencode/skills/skill2/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(TEST_DIR, 'opencode/.opencode/skills/skill3/SKILL.md'))).toBe(true);
  });

  test('should replace {{model}} placeholder', () => {
    const skills = [
      {
        name: 'test',
        description: 'Test',
        body: 'Ask {{model}} for help.'
      }
    ];

    transformOpenCode(skills, TEST_DIR);

    const content = fs.readFileSync(path.join(TEST_DIR, 'opencode/.opencode/skills/test/SKILL.md'), 'utf-8');
    expect(content).toContain('Ask Claude for help.');
  });

  test('should replace {{config_file}} placeholder', () => {
    const skills = [
      {
        name: 'test',
        description: 'Test',
        body: 'See {{config_file}} for details.'
      }
    ];

    transformOpenCode(skills, TEST_DIR);

    const content = fs.readFileSync(path.join(TEST_DIR, 'opencode/.opencode/skills/test/SKILL.md'), 'utf-8');
    expect(content).toContain('See AGENTS.md for details.');
  });

  test('should replace {{ask_instruction}} placeholder', () => {
    const skills = [
      {
        name: 'test',
        description: 'Test',
        body: 'If unclear, {{ask_instruction}}'
      }
    ];

    transformOpenCode(skills, TEST_DIR);

    const content = fs.readFileSync(path.join(TEST_DIR, 'opencode/.opencode/skills/test/SKILL.md'), 'utf-8');
    expect(content).toContain('STOP and call the `question` tool to clarify.');
  });

  test('should replace {{available_commands}} placeholder', () => {
    const skills = [
      { name: 'audit', description: 'Audit', userInvocable: true, body: 'Available: {{available_commands}}' },
      { name: 'polish', description: 'Polish', userInvocable: true, body: 'Polish body.' }
    ];

    transformOpenCode(skills, TEST_DIR);

    const content = fs.readFileSync(path.join(TEST_DIR, 'opencode/.opencode/skills/audit/SKILL.md'), 'utf-8');
    expect(content).toContain('Available: /audit, /polish');
  });

  test('should copy reference files', () => {
    const skills = [
      {
        name: 'frontend-design',
        description: 'Design skill',
        body: 'Design instructions.',
        references: [
          { name: 'typography', content: 'Typography reference', filePath: '/fake/path/typography.md' },
          { name: 'color', content: 'Color reference', filePath: '/fake/path/color.md' }
        ]
      }
    ];

    transformOpenCode(skills, TEST_DIR);

    const typoPath = path.join(TEST_DIR, 'opencode/.opencode/skills/frontend-design/reference/typography.md');
    const colorPath = path.join(TEST_DIR, 'opencode/.opencode/skills/frontend-design/reference/color.md');

    expect(fs.existsSync(typoPath)).toBe(true);
    expect(fs.existsSync(colorPath)).toBe(true);
    expect(fs.readFileSync(typoPath, 'utf-8')).toBe('Typography reference');
  });

  test('should replace placeholders in reference files without commandNames', () => {
    const skills = [
      {
        name: 'test',
        description: 'Test',
        userInvocable: true,
        body: 'Body with {{available_commands}}.',
        references: [
          { name: 'ref', content: 'Use {{model}} with {{config_file}}. Commands: {{available_commands}}.', filePath: '/fake/ref.md' }
        ]
      }
    ];

    transformOpenCode(skills, TEST_DIR);

    const refContent = fs.readFileSync(path.join(TEST_DIR, 'opencode/.opencode/skills/test/reference/ref.md'), 'utf-8');
    expect(refContent).toContain('Use Claude with AGENTS.md.');
    // Reference files should NOT get commandNames, so {{available_commands}} becomes empty string
    expect(refContent).toContain('Commands: .');
  });

  test('should support prefix option', () => {
    const skills = [
      { name: 'audit', description: 'Audit', userInvocable: true, body: 'Audit body' }
    ];

    transformOpenCode(skills, TEST_DIR, null, { prefix: 'i-', outputSuffix: '-prefixed' });

    const outputPath = path.join(TEST_DIR, 'opencode-prefixed/.opencode/skills/i-audit/SKILL.md');
    expect(fs.existsSync(outputPath)).toBe(true);

    const content = fs.readFileSync(outputPath, 'utf-8');
    expect(content).toContain('name: i-audit');
  });

  test('should prefix skill references in body when prefix is set', () => {
    const skills = [
      { name: 'audit', description: 'Audit', userInvocable: true, body: 'Run /polish after the audit skill.' },
      { name: 'polish', description: 'Polish', userInvocable: true, body: 'Polish body.' }
    ];

    transformOpenCode(skills, TEST_DIR, null, { prefix: 'i-', outputSuffix: '-prefixed' });

    const content = fs.readFileSync(path.join(TEST_DIR, 'opencode-prefixed/.opencode/skills/i-audit/SKILL.md'), 'utf-8');
    expect(content).toContain('/i-polish');
    expect(content).toContain('the i-audit skill');
  });

  test('should clean existing directory before writing', () => {
    const existingDir = path.join(TEST_DIR, 'opencode/.opencode/skills/old');
    fs.mkdirSync(existingDir, { recursive: true });
    fs.writeFileSync(path.join(existingDir, 'SKILL.md'), 'old');

    const skills = [{ name: 'new', description: 'New', body: 'New' }];
    transformOpenCode(skills, TEST_DIR);

    expect(fs.existsSync(path.join(TEST_DIR, 'opencode/.opencode/skills/old/SKILL.md'))).toBe(false);
    expect(fs.existsSync(path.join(TEST_DIR, 'opencode/.opencode/skills/new/SKILL.md'))).toBe(true);
  });

  test('should log correct summary', () => {
    const consoleMock = mock(() => {});
    const originalLog = console.log;
    console.log = consoleMock;

    const skills = [
      { name: 'skill1', description: 'Test', userInvocable: true, body: 'body' },
      { name: 'skill2', description: 'Test', userInvocable: false, body: 'body' }
    ];

    transformOpenCode(skills, TEST_DIR);

    console.log = originalLog;

    expect(consoleMock).toHaveBeenCalledWith(expect.stringContaining('✓ OpenCode:'));
    expect(consoleMock).toHaveBeenCalledWith(expect.stringContaining('2 skills'));
    expect(consoleMock).toHaveBeenCalledWith(expect.stringContaining('1 user-invocable'));
  });

  test('should log reference file count', () => {
    const consoleMock = mock(() => {});
    const originalLog = console.log;
    console.log = consoleMock;

    const skills = [
      {
        name: 'test',
        description: 'Test',
        body: 'Body.',
        references: [
          { name: 'ref1', content: 'Ref 1', filePath: '/fake/ref1.md' },
          { name: 'ref2', content: 'Ref 2', filePath: '/fake/ref2.md' }
        ]
      }
    ];

    transformOpenCode(skills, TEST_DIR);

    console.log = originalLog;

    expect(consoleMock).toHaveBeenCalledWith(expect.stringContaining('2 reference files'));
  });

  test('should handle empty skills array', () => {
    transformOpenCode([], TEST_DIR);

    const skillDirs = fs.readdirSync(path.join(TEST_DIR, 'opencode/.opencode/skills'));
    expect(skillDirs).toHaveLength(0);
  });

  test('should not include license if empty', () => {
    const skills = [
      {
        name: 'test',
        description: 'Test',
        license: '',
        body: 'Body'
      }
    ];

    transformOpenCode(skills, TEST_DIR);

    const content = fs.readFileSync(path.join(TEST_DIR, 'opencode/.opencode/skills/test/SKILL.md'), 'utf-8');
    expect(content).not.toContain('license:');
  });
});
