module.exports = {
  apps: [
    {
      name: 'validator-reward-checker',
      script: 'dist/index.js',

      // 스케줄러는 단일 인스턴스 필수 (cluster 시 cron 중복 실행 → DB 중복 저장)
      instances: 1,
      exec_mode: 'fork',

      // .env 파일 로드 (dotenv/config를 Node.js 시작 시 등록)
      node_args: ['-r', 'dotenv/config'],

      // 재시작 정책
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000, // 크래시 후 5초 대기 후 재시작
      min_uptime: '10s', // 10초 이상 실행되어야 정상 기동으로 판단

      // Graceful shutdown (SIGTERM → MongoDB 연결 정리 → 종료)
      kill_timeout: 10000, // 최대 10초 대기

      // 로그 (pino JSON 출력 → PM2가 파일로 캡처)
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: false,

      // 프로덕션 환경 변수
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
