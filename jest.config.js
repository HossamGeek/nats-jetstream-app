/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  // Unit tests live in test/unit/<entity>; application code stays under src/.
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
};
