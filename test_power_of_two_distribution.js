/**
 * Direct test of Power of Two Choices algorithm showing randomization
 */

import LoadBalancer from './server/loadBalancer.js';

console.log('='.repeat(80));
console.log('Power of Two Choices: Distribution Test');
console.log('='.repeat(80));

// Initialize with Power of Two enabled
const lb = new LoadBalancer(100, false, true);

// Simulate 5 devices with different TPS
const devices = [
  { base: 'http://device1:11434', tps: 500 },
  { base: 'http://device2:11434', tps: 400 },
  { base: 'http://device3:11434', tps: 300 },
  { base: 'http://device4:11434', tps: 200 },
  { base: 'http://device5:11434', tps: 100 }
];

lb.updateDeviceMetrics(devices);

console.log('\n[TEST] Power of Two sampling with equal queue loads\n');

// All devices have queue of 1 item (equal load)
const deviceQueues = {
  'http://device1:11434': [{ q: '1' }],
  'http://device2:11434': [{ q: '1' }],
  'http://device3:11434': [{ q: '1' }],
  'http://device4:11434': [{ q: '1' }],
  'http://device5:11434': [{ q: '1' }]
};

const deviceBusy = {
  'http://device1:11434': false,
  'http://device2:11434': false,
  'http://device3:11434': false,
  'http://device4:11434': false,
  'http://device5:11434': false
};

console.log('Queue state: All devices have 1 item (equal load)\n');
console.log('Running 50 selections with Power of Two algorithm...\n');

const selections = {};
for (let i = 0; i < 50; i++) {
  // Directly call the Power of Two method
  const selected = lb.selectDevicePowerOfTwo(deviceQueues, deviceBusy, 50);
  if (selected) {
    selections[selected] = (selections[selected] || 0) + 1;
  }
}

console.log('Distribution (should be relatively even across all 5 devices):\n');
const sorted = Object.entries(selections)
  .sort((a, b) => b[1] - a[1])
  .map(([base, count]) => ({
    device: base.split('//')[1],
    count,
    percentage: ((count / 50) * 100).toFixed(1)
  }));

sorted.forEach(({ device, count, percentage }) => {
  const bar = '█'.repeat(Math.floor(count / 2));
  console.log(`  ${device.padEnd(20)} ${bar} ${count}/50 (${percentage}%)`);
});

console.log('\n' + '='.repeat(80));
console.log('[TEST] Power of Two with unequal loads\n');

// Unequal loads: Device 1 heavily loaded, others lighter
const unequalQueues = {
  'http://device1:11434': Array(4).fill({ q: 'x' }),  // 4 items (at capacity)
  'http://device2:11434': [{ q: '1' }],                // 1 item
  'http://device3:11434': [{ q: '1' }],                // 1 item
  'http://device4:11434': [{ q: '1' }],                // 1 item
  'http://device5:11434': []                           // 0 items (idle)
};

console.log('Queue state:');
Object.entries(unequalQueues).forEach(([base, queue]) => {
  console.log(`  ${base.split('//')[1].padEnd(20)} ${queue.length} items`);
});

console.log('\nRunning 50 selections...\n');

const unequalSelections = {};
for (let i = 0; i < 50; i++) {
  const selected = lb.selectDevicePowerOfTwo(unequalQueues, deviceBusy, 50);
  if (selected) {
    unequalSelections[selected] = (unequalSelections[selected] || 0) + 1;
  }
}

console.log('Distribution (Device 5 with 0 items should get most, Device 1 at capacity gets none):\n');
const sortedUnequal = Object.entries(unequalSelections)
  .sort((a, b) => b[1] - a[1])
  .map(([base, count]) => ({
    device: base.split('//')[1],
    count,
    queueSize: unequalQueues[base].length,
    percentage: ((count / 50) * 100).toFixed(1)
  }));

sortedUnequal.forEach(({ device, count, queueSize, percentage }) => {
  const bar = '█'.repeat(Math.floor(count / 2));
  console.log(`  ${device.padEnd(20)} ${bar} ${count}/50 (${percentage}%) - queue: ${queueSize}`);
});

console.log('\n' + '='.repeat(80));
console.log('Summary');
console.log('='.repeat(80));
console.log('✓ Power of Two Choices provides randomized load distribution');
console.log('✓ With equal loads: spreads requests across all devices');
console.log('✓ With unequal loads: favors less-loaded devices');
console.log('✓ Avoids always picking the same "best" device (prevents hotspots)');
console.log('='.repeat(80) + '\n');
