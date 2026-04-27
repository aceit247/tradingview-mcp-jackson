/**
 * CLI unit tests — no TradingView connection needed.
 * Tests: help output, pine analyze, pine check, error handling, exit codes.
 *
 * Run: node --test tests/cli.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, unlinkSync, existsSync, readFileSync, rmSync, mkdirSync } from 'fs';
import { homedir } from 'os';

function require_fs() { return { writeFileSync, unlinkSync }; }

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'src', 'cli', 'index.js');

function run(args, opts = {}) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], {
      encoding: 'utf-8',
      timeout: 15000,
      ...opts,
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.status,
    };
  }
}

describe('CLI — help and routing', () => {
  it('--help shows command list', () => {
    const { stdout, exitCode } = run(['--help']);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('Usage: tv'));
    assert.ok(stdout.includes('status'));
    assert.ok(stdout.includes('pine'));
    assert.ok(stdout.includes('quote'));
  });

  it('-h is same as --help', () => {
    const { stdout, exitCode } = run(['-h']);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('Usage: tv'));
  });

  it('no args shows help', () => {
    const { stdout, exitCode } = run([]);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('Usage: tv'));
  });

  it('unknown command exits 1', () => {
    const { exitCode, stderr } = run(['nonexistent']);
    assert.equal(exitCode, 1);
    assert.ok(stderr.includes('Unknown command'));
  });

  it('pine --help shows subcommands', () => {
    const { stdout, exitCode } = run(['pine', '--help']);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('get'));
    assert.ok(stdout.includes('set'));
    assert.ok(stdout.includes('compile'));
    assert.ok(stdout.includes('analyze'));
    assert.ok(stdout.includes('check'));
  });

  it('ohlcv --help shows options', () => {
    const { stdout, exitCode } = run(['ohlcv', '--help']);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('--count'));
    assert.ok(stdout.includes('--summary'));
  });
});

describe('CLI — pine analyze (offline)', () => {
  it('analyzes clean v6 script', () => {
    const source = '//@version=6\nindicator("test")\nplot(close)';
    const { stdout, exitCode } = run(['pine', 'analyze'], { input: source });
    assert.equal(exitCode, 0);
    const result = JSON.parse(stdout);
    assert.equal(result.success, true);
    assert.equal(result.issue_count, 0);
  });

  it('detects array out of bounds', () => {
    const source = '//@version=6\nindicator("test")\narr = array.from(1, 2, 3)\nval = array.get(arr, 5)';
    const { stdout, exitCode } = run(['pine', 'analyze'], { input: source });
    assert.equal(exitCode, 0);
    const result = JSON.parse(stdout);
    assert.equal(result.issue_count, 1);
    assert.ok(result.diagnostics[0].message.includes('out of bounds'));
  });

  it('detects strategy.entry without strategy()', () => {
    const source = '//@version=6\nindicator("test")\nstrategy.entry("long", strategy.long)';
    const { stdout, exitCode } = run(['pine', 'analyze'], { input: source });
    assert.equal(exitCode, 0);
    const result = JSON.parse(stdout);
    assert.ok(result.diagnostics.some(d => d.message.includes('strategy()')));
  });

  it('errors without input', () => {
    // When stdin is a TTY (no pipe), analyze should error
    const { exitCode, stderr } = run(['pine', 'analyze']);
    assert.equal(exitCode, 1);
    assert.ok(stderr.includes('No source provided'));
  });

  it('reads --file flag', () => {
    const { writeFileSync, unlinkSync } = require_fs();
    const tmpFile = join(__dirname, '_test_script.pine');
    writeFileSync(tmpFile, '//@version=6\nindicator("test")\nplot(close)');
    try {
      const { stdout, exitCode } = run(['pine', 'analyze', '--file', tmpFile]);
      assert.equal(exitCode, 0);
      const result = JSON.parse(stdout);
      assert.equal(result.success, true);
    } finally {
      unlinkSync(tmpFile);
    }
  });
});

describe('CLI — pine check (server compile)', () => {
  it('compiles valid Pine Script', () => {
    const source = '//@version=6\nindicator("test")\nplot(close)';
    const { stdout, exitCode } = run(['pine', 'check'], { input: source });
    assert.equal(exitCode, 0);
    const result = JSON.parse(stdout);
    assert.equal(result.success, true);
    assert.equal(result.compiled, true);
  });

  it('returns errors for invalid Pine Script', () => {
    const source = '//@version=6\nindicator("test")\nplot(nonexistent_var)';
    const { stdout, exitCode } = run(['pine', 'check'], { input: source });
    assert.equal(exitCode, 0);
    const result = JSON.parse(stdout);
    assert.equal(result.compiled, false);
    assert.ok(result.error_count > 0);
  });
});

describe('CLI — morning brief / session (offline)', () => {
  const SESSIONS_DIR = join(homedir(), '.tradingview-mcp', 'sessions');
  const TEST_DATE = '2099-01-01'; // far future — won't collide with real sessions
  const TEST_PATH = join(SESSIONS_DIR, `${TEST_DATE}.json`);

  after(() => {
    if (existsSync(TEST_PATH)) unlinkSync(TEST_PATH);
  });

  it('brief --help shows --rules flag', () => {
    const { stdout, exitCode } = run(['brief', '--help']);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('--rules') || stdout.includes('-r'));
  });

  it('session --help lists get and save subcommands', () => {
    const { stdout, exitCode } = run(['session', '--help']);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('get'));
    assert.ok(stdout.includes('save'));
  });

  it('session save --brief "..." saves and returns file path', () => {
    const { stdout, exitCode } = run([
      'session', 'save',
      '--brief', 'BTCUSDT | BIAS: bullish | PRICE: 95000 | KEY LEVEL: 94500 | WATCH: RSI 58',
      '--date', TEST_DATE,
    ]);
    assert.equal(exitCode, 0);
    const result = JSON.parse(stdout);
    assert.equal(result.success, true);
    assert.ok(result.path.endsWith(`${TEST_DATE}.json`));
    assert.ok(existsSync(result.path));
  });

  it('session get returns the saved brief', () => {
    const { stdout, exitCode } = run(['session', 'get', '--date', TEST_DATE]);
    assert.equal(exitCode, 0);
    const result = JSON.parse(stdout);
    assert.equal(result.success, true);
    assert.ok(result.brief.includes('BTCUSDT'));
  });

  it('session save without --brief exits with error', () => {
    const { exitCode, stderr } = run(['session', 'save', '--date', TEST_DATE]);
    assert.equal(exitCode, 1);
    assert.ok(stderr.includes('--brief is required') || stderr.includes('brief'));
  });

  it('session get for unknown date returns failure', () => {
    const { stdout, exitCode } = run(['session', 'get', '--date', '1900-01-01']);
    // exits 0 or 1 depending on implementation; what matters is success: false
    const result = JSON.parse(stdout);
    assert.equal(result.success, false);
  });
});
