// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
