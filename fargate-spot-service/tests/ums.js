// Creator: k6 Browser Recorder 0.6.2

import { sleep, group } from 'k6'
import http from 'k6/http'

const tokens = {
    accessToken: "eyJraWQiOiJaQW1DTFhwNm9zZGxxUWJpRDgxN3c4Vmc5MENGam9xelFidnM1YnlPbEUwPSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiIxNzdmNTUxZC0wMzU0LTQyYjMtYTg0My0zMzNmMWQ2Zjg4MWIiLCJjb2duaXRvOmdyb3VwcyI6WyJhcC1zb3V0aC0xX1oxMkNwU2hEV19Hb29nbGUiXSwiaXNzIjoiaHR0cHM6XC9cL2NvZ25pdG8taWRwLmFwLXNvdXRoLTEuYW1hem9uYXdzLmNvbVwvYXAtc291dGgtMV9aMTJDcFNoRFciLCJ2ZXJzaW9uIjoyLCJjbGllbnRfaWQiOiI1dG5tMWc0a2EwNG1xaWQzMDhxN2JjdDg3ciIsIm9yaWdpbl9qdGkiOiI4ZGRhY2M5OC02M2I0LTQ0NTUtYTkwYS0yNTM4NDM3OTAxY2YiLCJ0b2tlbl91c2UiOiJhY2Nlc3MiLCJzY29wZSI6ImF3cy5jb2duaXRvLnNpZ25pbi51c2VyLmFkbWluIHBob25lIG9wZW5pZCBwcm9maWxlIGVtYWlsIiwiYXV0aF90aW1lIjoxNjYzNjAzOTUzLCJleHAiOjE2NjM2NjQxODcsImlhdCI6MTY2MzY2MDU4NywianRpIjoiY2M4ZmI2MDEtN2QxNC00YjgyLWFhNmItNTU5ODkzYTk5ZDYyIiwidXNlcm5hbWUiOiJHb29nbGVfMTA2MzUyNTkzMTY0NTI0NTA3MjI5In0.mYhl8KwTLzzmZ7W-l6xvsr_BmEmQtih7QHiK1kzXkrkd2iVPUZUuPYcm1kE0Rk2PRjIKzXFFVDEV5PHUaDQANoH9B5FrXx3PgYuhD4bMSAoTYuNYCgvGN7zZJpqKmINafONKSP-lqu5jD3-EtKdt58qgvacaidhi84PV3F9Jst6jjjmBhi-ZbFbUjWfYrvMcSurY8ZE9iKyGoXutfqYz4Ia5iinaVFBC-K059rCR1kYgc1NVCy0T0_kmYjm2buCJkIxT_3QfhfYOwTLgk-fcwGs_ORBE6DJ4yQSvd3cd0E6ogQIi8J1AeWcGwwtC8dZOf8imVFoMRXByOvFKKO404w",
    idToken: "eyJraWQiOiJQRzdvbCt5am1XZllaVVQ2YU1JT0xyNTBjTDZxblpKRndIZ3lzM0c1WHdvPSIsImFsZyI6IlJTMjU2In0.eyJhdF9oYXNoIjoidWRSUzk1YjNqWnZlUl9mRkpRUkVlUSIsInN1YiI6IjE3N2Y1NTFkLTAzNTQtNDJiMy1hODQzLTMzM2YxZDZmODgxYiIsImNvZ25pdG86Z3JvdXBzIjpbImFwLXNvdXRoLTFfWjEyQ3BTaERXX0dvb2dsZSJdLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiaXNzIjoiaHR0cHM6XC9cL2NvZ25pdG8taWRwLmFwLXNvdXRoLTEuYW1hem9uYXdzLmNvbVwvYXAtc291dGgtMV9aMTJDcFNoRFciLCJwaG9uZV9udW1iZXJfdmVyaWZpZWQiOmZhbHNlLCJjb2duaXRvOnVzZXJuYW1lIjoiR29vZ2xlXzEwNjM1MjU5MzE2NDUyNDUwNzIyOSIsImdpdmVuX25hbWUiOiJIYXJpc2giLCJwaWN0dXJlIjoiaHR0cHM6XC9cL2xoMy5nb29nbGV1c2VyY29udGVudC5jb21cL2FcL0FMbTV3dTF5TUY2X0tkOVNJTGZTNUpWRjZYNW1jbktpcl84MHZxRFFXU3hTPXM5Ni1jIiwib3JpZ2luX2p0aSI6IjhkZGFjYzk4LTYzYjQtNDQ1NS1hOTBhLTI1Mzg0Mzc5MDFjZiIsImF1ZCI6IjV0bm0xZzRrYTA0bXFpZDMwOHE3YmN0ODdyIiwiaWRlbnRpdGllcyI6W3sidXNlcklkIjoiMTA2MzUyNTkzMTY0NTI0NTA3MjI5IiwicHJvdmlkZXJOYW1lIjoiR29vZ2xlIiwicHJvdmlkZXJUeXBlIjoiR29vZ2xlIiwiaXNzdWVyIjpudWxsLCJwcmltYXJ5IjoidHJ1ZSIsImRhdGVDcmVhdGVkIjoiMTY0ODU1MjIzMDUzMSJ9XSwidG9rZW5fdXNlIjoiaWQiLCJhdXRoX3RpbWUiOjE2NjM2MDM5NTMsIm5hbWUiOiJIYXJpc2giLCJleHAiOjE2NjM2NjQxODcsImlhdCI6MTY2MzY2MDU4NywiZmFtaWx5X25hbWUiOiJTYW1iYXNpdmFtIiwianRpIjoiNmVlMTAzOTEtYjBiNy00ZDgyLTgzMzEtYjBjZTFiNzE4YmQ2IiwiZW1haWwiOiJoYXJpc2guc2FtYmFzaXZhbUBieWp1cy5jb20ifQ.AB5g5N_pxP3XM2zzrBirl4hYTUmG-1XpEcC5RQ5ZF1qoEXldg-Y7GzR1ptAmfDBtSlKTX1UE_RPUU0syg_DP0r0qQgNBhNyydJ4ya03xy7HL0lA9jsq1yoMlBsb5K7l-AZsdOzpTlSNgB3Cev60-yEZ4q-_yg2L3gnLRFUkQ5isfTeE8N5LZenr4mu-7ANYaW-6tv7Og4EBVoH_PhKbPicboOOH2P59fJhj18_boio9xU5jYgMZ2v61Z1MskwiZArFit30JF66xadUSWEc7OTPjwr39I3huNOZPaLKM5N85ufvsIGI3Tx_t1EzWG6-MgXuCgHxS5Xe2ORUBhKtjXAQ",
    refreshToken: "eyJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwiYWxnIjoiUlNBLU9BRVAifQ.XE38loCiK5EW3TOM_AiFdwSTGTj1wSrJQ2oroVS_oDL0FwwETq05GNWFZZFIhiZXm8__ycAbD-jcxRp6Z9zrrbjYOPqa2pZNZssoeXzoFRR54HlnZXXklW33hqaiIGezWf-pLJGqBIwxK72TfscaUz_Wg7kYxVOcJZ-duBumZV5cPp1QdGW1-OWi4XQ0sNgP98ARB1Q_aClmicBTjfybb9JgOJI75YKWFX4F4vSSx2MDjxcPl1iQWkOU1yeWVis5gmOwNTY5kGlqbTcVNtvaWViYzjd_TYx7M0LVb2l8102PiAffZfM1Qzl2km68hsE8p7wLa_FBSiHEVorKViOWUQ.zi6NKspsLyNsZ0au.t0xJsph29eUNOlVtytjV-MujiK3R5iryLIdOMFwK33ihp3jnLmJpZg7m5zU7Bgu4a0t5s3Y3twsh9QftZP03ljdvGQ6WO4SfYz9IgWIfaFvKnU1Q34E-huDolCrjpAZ6n9twrpEsBpLIFx47dsGpXdi7iSdLOoKkAzw2WOl6WGP94RH3ijy9p_xj3tuoTO9wUhuOEZQJhHvC1FyTDD2Ds9C40TQkDuR5vQotR-9Vqvp2FCGxwXkPnzvGp3fT1a6d7gGmxl4gdv_Zo0Hc6Hy9BVrw4_D8Jd0jcyHpsJSRd0HoJ9dM9M070et4G7q8F_kzD4o2Pzu60Mg30f-OVRvine0fzCopvZGLNEoyS6Rq2uuF51E2IsbV4hdtX5bQY0M4xhfCRVK-lNn6YuoDcvVTKNIwDRyS5n-N4t2pjj-8Q60omJLhfvD8QK6pinLKytSjJ8oQDddsilzUohH5wQ9m3s6gLugXuZSc7Ka1bAqzfWQx5r5E6C-OawX-BXVRks4D29cm5H3jeDJQ5DWL06nqPViIE_XVGpXHEG__8O_yeDFJAYBzpQTnUC8-RtDPemeyyQFHJrMlPBCCP0srr5eRnsDXtTGJ0Fqp_Y_0OAyDtjabZ5jKiwskHRU-jDWChCRDln3wVsicBQqwy8F4NnONdgftYO9WgyROvbaeqcZ_dyd_ow6bR0bSZKr-qXxOho8EKyzqmxXCuALLwr7DlekKLbgPuTCfM0rmfDp1easIvhVSVoNUfLc_zlu-iQwY0wW4KMIv3fxsSc0cJaV81Dw_228S7VwwIYX3SukiP6GUwfvO4kWQDrNpfn6vJE05j6qW1tTwcBOtQbfMGyo3HsHoD6SEnQxDmdWUz51pu9U2leff-_2qtWwN4WwQ1pAsh5mmX0Fi96G11X_3OfC_sA_DxWSpxHLkWuACXbXk-lD-wkU87YU53lOB6NvNc1k7qZjPxAFw2FtV5bnBNmwJMjnEisDXxTsplQHYBLkuXGYTKWgS1mDaoillouyrFzMMF2CE9sAARNqvcWhQYbRe-8loVw1LPnzp59xgikSQkWkTOFanT7-RB-865mCQW-5IIjh1IzLSOMZC6uGRayFSqD22W29d7qGi0GAdB08LhX-c1QdM6a2HwDpvJdawHV3NwvNh9E-nFxONMr-gEWlr7PadI-MzJ_5RORmqD6UOWo5wMMrn3Vz5mu_Mrs7N15prpGNoFdDvq5NDWnGJdhafzDlF03_OeNkqFv2hUK2isYjZ1ju8dc4cgOH_Qd5L_MuhZ0ph2SM-NW4J1c47_X_mQPt8LwEPR25Jogdj.Th4eda9P9Fil_t6tj1WH9A"
}

export const options = {
    stages: [
      { duration: '5m', target: 1 },
      { duration: '5m', target: 2 },
      { duration: '5m', target: 3 },
    ],
  };

const xApiKey = __ENV.apiKey;

export default function main() {
    let response

    group('page_1 - https://dev-users.byjusorders.com', function () {
        response = http.get(
            'https://dev-nucleus.byjusorders.com/nucleusapi/usermanagement/employee/getUserProfile',
            {
                headers: {
                    'content-type': 'application/json',
                    'sec-ch-ua': '"Google Chrome";v="105", "Not)A;Brand";v="8", "Chromium";v="105"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"macOS"',
                    'x-access-token':
                        tokens["accessToken"],
                    'x-app-origin': 'ums',
                    'x-id-token':
                        tokens["idToken"],
                    'x-refresh-token':
                        tokens["refreshToken"],
                },
            }
        )

        if(response.status !== 200) console.debug(response);

        response = http.get(
            'https://dev-nucleus.byjusorders.com/nucleusapi/usermanagement/employee/getByEmail/harish.sambasivam@byjus.com',
            {
                headers: {
                    'content-type': 'application/json',
                    'sec-ch-ua': '"Google Chrome";v="105", "Not)A;Brand";v="8", "Chromium";v="105"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"macOS"',
                    'x-api-key':
                        xApiKey,
                    'x-app-origin': 'ums'
                },
            }
        )
        if(response.status !== 200) console.debug(response);


        response = http.post(
            'https://dev-nucleus.byjusorders.com/nucleusapi/usermanagement/apptoken/list',
            {
                headers: {
                    'content-type': 'application/json',
                    'sec-ch-ua': '"Google Chrome";v="105", "Not)A;Brand";v="8", "Chromium";v="105"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"macOS"',
                    'x-api-key': xApiKey,
                    'x-app-origin': 'ums'
                },
            },
            { "gridId": "ums_apptoken_grid", "viewName": "all", "model": "AppTokens", "page": 1, "limit": 10 }
        )
        if(response.status !== 200) console.debug(response);

        response = http.get(
            'https://dev-nucleus.byjusorders.com/nucleusapi/usermanagement/employee/getUserProfile',
            {
                headers: {
                    'content-type': 'application/json',
                    'sec-ch-ua': '"Google Chrome";v="105", "Not)A;Brand";v="8", "Chromium";v="105"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"macOS"',
                    'x-access-token':
                        tokens["accessToken"],
                    'x-app-origin': 'ums',
                    'x-id-token':
                        tokens["idToken"],
                    'x-refresh-token':
                        tokens["refreshToken"],
                },
            }
        )
        if(response.status !== 200) console.debug(response);

        response = http.get(
            'https://dev-nucleus.byjusorders.com/nucleusapi/usermanagement/employee/getByEmail/harish.sambasivam@byjus.com',
            {
                headers: {
                    'content-type': 'application/json',
                    'sec-ch-ua': '"Google Chrome";v="105", "Not)A;Brand";v="8", "Chromium";v="105"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"macOS"',
                    'x-api-key':
                        xApiKey,
                    'x-app-origin': 'ums'
                },
            }
        )
        if(response.status !== 200) console.debug(response);

        response = http.post(
            'https://dev-nucleus.byjusorders.com/nucleusapi/usermanagement/apptoken/list',
            {
                headers: {
                    'content-type': 'application/json',
                    'sec-ch-ua': '"Google Chrome";v="105", "Not)A;Brand";v="8", "Chromium";v="105"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"macOS"',
                    'x-api-key': xApiKey,
                    'x-app-origin': 'ums'
                },
            },
            { "gridId": "ums_apptoken_grid", "viewName": "all", "model": "AppTokens", "page": 1, "limit": 10 }
        )
        if(response.status !== 200) console.debug(response);

        response = http.get(
            'https://dev-nucleus.byjusorders.com/nucleusapi/usermanagement/employee/getUserProfile',
            {
                headers: {
                    'content-type': 'application/json',
                    'sec-ch-ua': '"Google Chrome";v="105", "Not)A;Brand";v="8", "Chromium";v="105"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"macOS"',
                    'x-access-token':
                        tokens["accessToken"],
                    'x-app-origin': 'ums',
                    'x-id-token':
                        tokens["idToken"],
                    'x-refresh-token':
                        tokens["refreshToken"],
                },
            }
        )
        if(response.status !== 200) console.debug(response);

        response = http.get(
            'https://dev-nucleus.byjusorders.com/nucleusapi/usermanagement/employee/getByEmail/harish.sambasivam@byjus.com',
            {
                headers: {
                    'content-type': 'application/json',
                    'sec-ch-ua': '"Google Chrome";v="105", "Not)A;Brand";v="8", "Chromium";v="105"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"macOS"',
                    'x-api-key':
                        xApiKey,
                    'x-app-origin': 'ums'
                },
            }
        )
        if(response.status !== 200) console.debug(response);

        response = http.post(
            'https://dev-nucleus.byjusorders.com/nucleusapi/usermanagement/apptoken/list',
            {
                headers: {
                    'content-type': 'application/json',
                    'sec-ch-ua': '"Google Chrome";v="105", "Not)A;Brand";v="8", "Chromium";v="105"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"macOS"',
                    'x-api-key': xApiKey,
                    'x-app-origin': 'ums'
                },
            },
            { "gridId": "ums_apptoken_grid", "viewName": "all", "model": "AppTokens", "page": 1, "limit": 10 }
        )
        if(response.status !== 200) console.debug(response);

        
        // response = http.get(
        //     'https://dev-nucleus.byjusorders.com/nucleusapi/usermanagement/analytics/listAllUsers',
        //     {
        //         headers: {
        //             'content-type': 'application/json',
        //             'sec-ch-ua': '"Google Chrome";v="105", "Not)A;Brand";v="8", "Chromium";v="105"',
        //             'sec-ch-ua-mobile': '?0',
        //             'sec-ch-ua-platform': '"macOS"',
        //             'x-access-token':
        //                 tokens["accessToken"],
        //             'x-app-origin': 'ums',
        //             'x-id-token':
        //                 tokens["idToken"],
        //             'x-refresh-token':
        //                 tokens["refreshToken"],
        //         },
        //     }
        // )
        // if(response.status !== 200) console.debug(response);

        // response = http.post(
        //     'https://dev-nucleus.byjusorders.com/nucleusapi/usermanagement/analytics/listRole',
        //     '{"gridId":"ums_application_role_grid","viewName":"all","model":"AppRole","page":1,"limit":10,"contextCriterias":[],"sort":{}}',
        //     {
        //         headers: {
        //             'content-type': 'application/json',
        //             'sec-ch-ua': '"Google Chrome";v="105", "Not)A;Brand";v="8", "Chromium";v="105"',
        //             'sec-ch-ua-mobile': '?0',
        //             'sec-ch-ua-platform': '"macOS"',
        //             'x-access-token':
        //                 tokens["accessToken"],
        //             'x-app-origin': 'ums',
        //             'x-id-token':
        //                 tokens["idToken"],
        //             'x-refresh-token':
        //                 tokens["refreshToken"],
        //         },
        //     }
        // )
        // if(response.status !== 200) console.debug(response);

        response = http.post(
            'https://dev-nucleus.byjusorders.com/nucleusapi/usermanagement/employee/listMasterData',
            '{"gridId":"ums_master_grid","viewName":"all","model":"MasterEmployee","page":1,"limit":10,"contextCriterias":[],"sort":{}}',
            {
                headers: {
                    'content-type': 'application/json',
                    'sec-ch-ua': '"Google Chrome";v="105", "Not)A;Brand";v="8", "Chromium";v="105"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"macOS"',
                    'x-access-token':
                        tokens["accessToken"],
                    'x-app-origin': 'ums',
                    'x-id-token':
                        tokens["idToken"],
                    'x-refresh-token':
                        tokens["refreshToken"],
                },
            }
        )
    })

    if(response.status !== 200) console.debug(response);

    // Automatically added sleep
    sleep(1)
}
