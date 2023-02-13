import * as functions from "firebase-functions";
import {Convoy} from "convoy.js";
import {CONVOY_API_KEY, CONVOY_ENDPOINT_ID, CONVOY_PROJECT_ID} from "./env";


//Todo : Extract into env variables and split dev with production
const convoy = new Convoy({
    api_key: CONVOY_API_KEY,
    project_id: CONVOY_PROJECT_ID
})


const endpointId = CONVOY_ENDPOINT_ID;

const eu_function = functions.region('europe-west1');

interface Threshold {
    TEMP: number,
    HUM: number
}

const THRESHOLD: Threshold = {
    TEMP: 27,
    HUM: 70
}
export const iotWeatherWebhook = eu_function.database.ref('live_record/{sensor}')
    .onUpdate(async (snapshot, context) => {

        const record: any = {};

        const prev_record = await snapshot.after.ref.parent?.get();
        functions.logger.log("SUCCESS : ", prev_record?.val());
        const temp_moy: number = (prev_record?.val()["sensor1"]["temp"] + prev_record?.val()["sensor2"]["temp"]) / 2;
        const hum_moy: number = (prev_record?.val()["sensor1"]["hum"] + prev_record?.val()["sensor2"]["hum"]) / 2;
        record['hum_moy'] = hum_moy.toFixed(2);
        record['temp_moy'] = temp_moy.toFixed(2);

        //Check whether the event has already been triggered
        let isEventTriggered: boolean = false;
        const eventSnapshot = await snapshot.after.ref.parent?.ref.parent?.child('is_event_triggered').get()

        if (eventSnapshot?.exists()) {
            const eventInit: { hum: boolean, temp: boolean } = eventSnapshot.val();
            const tempEventAlreadyTriggered = eventInit.temp;
            const humEventAlreadyTriggered = eventInit.hum;

            let event_type: string = "";
            functions.logger.log("SUCCESS : ", eventInit);

            if (temp_moy > THRESHOLD.TEMP && !tempEventAlreadyTriggered) {
                event_type = 'iot.high_temp';
                isEventTriggered = true;
                await snapshot.after.ref.parent?.ref.parent?.child('is_event_triggered/temp').set(true);
            }

            if (hum_moy > THRESHOLD.HUM && !humEventAlreadyTriggered) {
                event_type = 'iot.high_hum';
                isEventTriggered = true;
                await snapshot.after.ref.parent?.ref.parent?.child('is_event_triggered/hum').set(true);
            }

            if (isEventTriggered && (!tempEventAlreadyTriggered || !humEventAlreadyTriggered)) {
                const eventData = {
                    app_id: "",
                    endpoint_id: endpointId,
                    event_type: event_type,
                    data: {
                        event_type: event_type,
                        data: record
                    },
                };
                convoy.events
                    .create(eventData)
                    .then((response) => {
                        functions.logger.log("SUCCESS : ", response);
                        return snapshot
                    })
                    .catch((error) => {
                        functions.logger.log("ERROR : ", error);
                    });
            }

        }
        //Test mode

        // @ts-ignore


        return snapshot.after.ref.parent?.ref.parent?.child('history/' + Date.now()).set(record);
    });


