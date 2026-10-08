import { describe, expect, it } from 'vitest';
import { BucketPolicies } from './bucket-policies.js';

describe('BucketPolicies', () => {
  it('denies everything for a bucket without a policy', async () => {
    const policies = new BucketPolicies();
    expect(await policies.canRead('media', 'user-1', 'a.jpg')).toBe(false);
  });

  it('asks the registered check of that bucket', async () => {
    const policies = new BucketPolicies();
    policies.setReadCheck('media', (userId, key) =>
      Promise.resolve(userId === 'user-1' && key === 'a.jpg'),
    );

    expect(await policies.canRead('media', 'user-1', 'a.jpg')).toBe(true);
    expect(await policies.canRead('media', 'user-2', 'a.jpg')).toBe(false);
    // other buckets are not affected
    expect(await policies.canRead('other', 'user-1', 'a.jpg')).toBe(false);
  });
});
