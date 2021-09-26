# Discord Music Bot with Voice Commands
Simple Discord music bot with voice commands using [Mozilla Deepspeech](https://github.com/mozilla/DeepSpeech).

### Deployment
1. Deploys to heroku using [khlam/heroku-deploy](https://github.com/khlam/heroku-deploy), set `HEROKU_API_KEY`, `HEROKU_APP_NAME`, and `HEROKU_EMAIL` in github secrets.

2. Add the following environment config vars and their values to Heroku app:
- `TOKEN <your token>`

### Development
1. Create file `.env` in project root with the following:
- `TOKEN=<your token>`

2. Run with `docker-compose up`