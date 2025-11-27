module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./src'],
        extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
        alias: {
          '@': './src',
          '@/components': './src/components',
          '@/screens': './src/screens',
          '@/navigation': './src/navigation',
          '@/hooks': './src/hooks',
          '@/api': './src/api',
          '@/theme': './src/theme',
          '@/types': './src/types',
          '@/utils': './src/utils',
          '@/config': './src/config',
          '@/context': './src/context',
          '@/native': './src/native',
          '@/assets': './src/assets',
        },
      },
    ],
  ],
};
