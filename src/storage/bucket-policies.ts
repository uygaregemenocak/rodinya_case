import { Injectable } from '@nestjs/common';

// returns true if the user is allowed to read the object
export type ReadCheck = (userId: string, key: string) => Promise<boolean>;

// Works like a bucket policy in S3. The module that owns a bucket registers
// who can read from it, and every presigned url request is checked against
// it. So when someone loses access, the urls they already have stop working.
@Injectable()
export class BucketPolicies {
  private readonly readChecks = new Map<string, ReadCheck>();

  setReadCheck(bucket: string, check: ReadCheck) {
    this.readChecks.set(bucket, check);
  }

  canRead(bucket: string, userId: string, key: string): Promise<boolean> {
    const check = this.readChecks.get(bucket);
    // a bucket without a policy can't be read by anyone
    if (!check) {
      return Promise.resolve(false);
    }
    return check(userId, key);
  }
}
