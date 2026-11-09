module.exports = {
  testEnvironment: 'jsdom',
  transform: { '^.+\\.(t|j)sx?$': ['@swc/jest', { jsc: { transform: { react: { runtime: 'automatic' } } } }] },
  moduleNameMapper: { '\\.css$': 'identity-obj-proxy' },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
}
