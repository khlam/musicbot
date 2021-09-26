const fetch = require("node-fetch")

const youtube = require('./youtubeObj')

const GSHEETURL = process.env.GSHEET

let triggerWords = []

let youtubeURL = []

let triggerObj = []

function sleep(time, callback) {
    var stop = new Date().getTime();
    while(new Date().getTime() < stop + time) {
        ;
    }
    callback();
}

function randint(min, max){
    return Math.floor(Math.random()*(max-min+1)+min)
}

function parseGSHEET(gArray){
    triggerWords = []
    youtubeURL = []
    console.log(gArray.length)
    gArray.shift() // remove header row
    gArray.forEach(row => {
        row = row.c
        console.log(row[0].v, row[1].v)

        let triggerWordString = row[0].v
        let ytAddr = row[1].v

        triggerWords.push(triggerWordString.split(','))
        youtubeURL.push(ytAddr)
    })
    console.log(triggerWords, youtubeURL)
    return
}

function getLevObj(triggerWord, _ytObj) {
    let _lev = parseInt(Math.floor(triggerWord.length / 3))

    if (triggerWord.length <= 6 ){ // if trigger word length ommitting spaces is 6 or less set lev to 1
        _lev = 1
    }
    return {
        trigger: triggerWord,
        lev: _lev,
        ytObj: _ytObj
    }
}

async function customListObj() {
    triggerObj = []
    for (let i = 0; i < triggerWords.length; i++) {
        let ytObj = await youtube.getYoutubeObj(youtubeURL[i])
        //console.log("here", youtubeURL[i])
        for (let j = 0; j < triggerWords[i].length; j++) {
            let _word = triggerWords[i][j]
            let _trigObj = getLevObj(_word, ytObj)
            triggerObj.push(_trigObj)
        }
    }
}

function updateGSHEET(){
    return new Promise(function(resolve, reject){
        fetch(GSHEETURL).then(res => res.text()).then(body => {
            try {
                const json = JSON.parse(body.substr(47).slice(0, -2))
                parseGSHEET(json.table.rows)
                return resolve(true)
            }catch(e) {
                const _rnd = randint(3000, 5000)
                console.log("Error with gsheet, sleeping", _rnd,"ms")
                sleep(_rnd, () => {
                    return resolve(false)
                })  
            }
        })
    })
}

function init() {
    return new Promise(function(resolve, reject){
        updateGSHEET().then(res => {
            if (res === false){
                return resolve([])
            }
            customListObj().then( () => {
                return resolve(triggerObj)
            })
        })
    })
}

module.exports = { init }