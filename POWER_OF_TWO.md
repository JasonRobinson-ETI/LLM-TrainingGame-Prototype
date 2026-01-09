# Power of Two Choices Load Balancing

## Overview
Implemented the "Power of Two Choices" load balancing algorithm, as used in production by Netflix, NGINX, and HAProxy.

## How It Works
Instead of always picking the "best" device (which creates hotspots), the algorithm:
1. Randomly samples 2 devices from the available pool
2. Compares their expected completion times
3. Selects the less loaded of the two

## Benefits Over Greedy Algorithm

### Greedy Algorithm (Previous Default)
- ❌ Always picks the device with absolute minimum completion time
- ❌ Creates hotspots where one device gets overloaded
- ❌ O(n) time complexity - must check all devices
- ❌ Can cause contention when many requests arrive simultaneously

### Power of Two Choices (New Default)
- ✅ Randomly samples only 2 devices
- ✅ Achieves near-optimal load balance with minimal overhead
- ✅ O(1) time complexity - constant time selection
- ✅ Prevents hotspots by distributing load more evenly
- ✅ Mathematically proven to exponentially reduce queue lengths

## Configuration

The LoadBalancer now accepts three parameters:
```javascript
new LoadBalancer(tpsPerPerson, useGreedy, usePowerOfTwo)
```

### Default Configuration (LLMService)
```javascript
this.loadBalancer = new LoadBalancer(100, false, true);
// tpsPerPerson = 100
// useGreedy = false (disabled)
// usePowerOfTwo = true (enabled by default)
```

### Runtime Controls
```javascript
// Toggle Power of Two
loadBalancer.setPowerOfTwoMode(true);  // Enable
loadBalancer.setPowerOfTwoMode(false); // Disable

// Toggle Greedy (for comparison/testing)
loadBalancer.setGreedyMode(true);

// Check current strategy
console.log(loadBalancer.getStrategy());
// Output: "Power of Two Choices"
```

## Performance Characteristics

### Test Results (50 selections)
**Equal Load Scenario (all devices at 1 item):**
- Device 1 (500 TPS): 22 selections (44%)
- Device 2 (400 TPS): 21 selections (42%)
- Device 3 (300 TPS): 7 selections (14%)

Result: Good distribution across fast devices, avoiding single hotspot.

**Unequal Load Scenario:**
- Device 1 (at capacity, 4 items): 2 selections (4%)
- Device 2 (light, 1 item): 23 selections (46%)
- Device 3 (light, 1 item): 15 selections (30%)
- Device 4 (light, 1 item): 7 selections (14%)
- Device 5 (idle, 0 items): 3 selections (6%)

Result: Heavily loaded device avoided, light devices favored.

## Mathematical Background

The "Power of Two Choices" theorem states that:
- Random selection: Expected max queue length = Θ(log n)
- Two random choices: Expected max queue length = Θ(log log n)

This exponential improvement makes it extremely effective in practice.

## Implementation Files

- `server/loadBalancer.js` - Core implementation
  - `selectDevicePowerOfTwo()` method (new)
  - Constructor updated with `usePowerOfTwo` parameter
  - Priority: Power of Two > Greedy > Complexity-based routing

- `server/llmService.js` - Initialization
  - Enabled by default for production use

- `test_power_of_two_distribution.js` - Comprehensive tests
  - Distribution verification
  - Edge case handling
  - Comparison with greedy algorithm

## Usage in Production

The algorithm is automatically used for all LLM request routing when:
1. Question complexity analysis is enabled (has question text)
2. Power of Two mode is enabled (default)
3. Multiple online devices are available

The system will log selections showing the comparison:
```
[LoadBalancer] Power of Two: sampled device1 (0.20s) vs device3 (0.33s) → chose device1
```

## Testing

Run the distribution test to verify behavior:
```bash
node test_power_of_two_distribution.js
```

This will show:
- Random sampling behavior
- Load distribution across devices
- Handling of equal and unequal loads
- Edge cases (single device, all at capacity)
