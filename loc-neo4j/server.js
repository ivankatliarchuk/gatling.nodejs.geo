'use strict';
const express = require('express');
const neo4j = require('node-neo4j');
const app = express();
const db = new neo4j('http://172.16.11.5:7474');
const http = require("http");
const request = require('request');
const payload = require('./data/salesforce.json');
var sleep = require('sleep');

app.listen(8089, function () {
    console.log('started on port 8089');
});

app.get('/readfacilities', function (req, res) {
    let data = ['tobaccoSales', 'hasBoxes', 'ident', 'parking', 'atm', 'printInStore'];
    let ids = {};
    for (let i in data) {
        let cipher = 'MATCH (n:Facility {name:\'' + data[i] + '\'}) RETURN n LIMIT 25';
        db.cypherQuery(cipher, function (err, result) {
            if (err) throw err;
            console.log(result);
            ids[data[i]] = result._id;
        });
    }

    res.json(ids)
});

app.get('/find', function (req, res, next) {
    // promise
    let response = res;
    let query = req.query.findquery;
    let dist = req.query.dist;
    console.log(query + ":" + dist);

    console.log(res);
    let lat = res[0].latitude;
    let long = res[0].longitude;
    let cipher = "CALL spatial.withinDistance('geom',{lon:" + long + ", lat:" + lat + "}, " + dist + ")";

    db.cypherQuery(cipher, function (err, result) {
        if (err) throw err;

        console.log(result.data); // delivers an array of query results
        console.log(result.columns); // delivers an array of names of objects getting returned
        response.json(result.data)
    });

});

app.get('/facilities', function (req, res, next) {
    let data = ['tobaccoSales', 'hasBoxes', 'ident', 'parking', 'atm', 'printInStore'];
    for (let i in data) {
        let facility = data[i];
        db.insertNode({
            name: facility
        }, ['Facility'], function (err, node) {
            if (err) return next(err);
        });
    }
    res.end('Setup facilities');
});


app.get('/upload', function (req, res, next) {
    // pass post code
    let headers = {
        'Content-Type': 'application/json'
    };

    let data = ['tobaccoSales', 'hasBoxes', 'ident', 'parking', 'atm', 'printInStore'];
    let ids = {};
    for (let i in data) {
        let cipher = 'MATCH (n:Facility {name:\'' + data[i] + '\'}) RETURN n LIMIT 25';
        db.cypherQuery(cipher, function (err, result) {
            if (err) throw err;
            console.log(result);
            ids[data[i]] = result.data[0]._id;
            console.log(result.data[0]._id);
        })
    }

    setTimeout(function () {
        console.log(ids);
    }, 1000);

    let counter = 0;
    for (let i in payload.data) {
        let shop = payload.data[i];
        setTimeout(function () {
            db.insertNode({
                id: shop.parcelShopId,
                description: shop.description,
                lat: shop.latitude,
                lon: shop.longitude,
                phoneNumer: shop.phoneNumber
            }, ['Shop'], function (err, node) {
                if (err) {
                    console.log('Error when create SHOP node');
                    return next(err);
                }
                let parentId = node._id;
                addToPointLayer(parentId, headers);
                setTimeout(function () {
                }, 5);
                addAddressToNode(parentId, shop);
                setTimeout(function () {
                }, 5);

                for (let sf in shop.facilities) {
                    let val_id = shop.facilities[sf].id;
                    console.log('facility id ' + ids[val_id]);
                    if (val_id != undefined)
                        db.insertRelationship(parentId, ids[val_id], 'HAS', {title: val_id}, function (err, body) {
                            if (err) {
                                console.log('Error when added rel to faciltiy where facility is ' + shop.facilities[sf].id + ':' + val_id);
                                throw err;
                            }
                        });
                }
                setTimeout(function () {
                }, 15);


                // for (let sf in shop.facilities) {
                //     switch (shop.facilities[sf]) {
                //         // REVIEW find node ids
                //         // RUN CIPHER?
                //         case 'tobaccoSales':
                //             db.insertRelationship(node._id, 2, 'HAS', {title: 'suite case'});
                //             break;
                //         case 'hasBoxes':
                //             db.insertRelationship(node._id, 1, 'HAS', {title: 'boxes'});
                //             break;
                //         case 'ident':
                //             db.insertRelationship(node._id, 6, 'HAS', {title: 'ident'});
                //             break;
                //         case 'atm':
                //             db.insertRelationship(node._id, 7, 'HAS', {title: 'atm'});
                //             break;
                //         case 'printInStore':
                //             db.insertRelationship(node._id, 7, 'HAS', {title: 'printInStore'});
                //             break;
                //         case 'parking':
                //             db.insertRelationship(node._id, 7, 'HAS', {title: 'parking'});
                //             break;
                //     }
                // }
                counter += 1;
                console.log('shop id:' + shop.parcelShopId + ' counter:' + counter)
            });

        }, 100);
    }
    res.end('Updated ' + counter);
});

function addAddressToNode(parentId, shop) {
    db.insertNode({
        street: shop.address.street,
        city: shop.address.city,
        postCode: shop.address.postCode
    }, ['Address'], function (err, node) {
        if (err) {
            console.log("-ERROR>>" + JSON.stringify(shop) + ' and parent id is ' + parentId);
            throw err
        }
        db.insertRelationship(parentId, node._id, 'Location', {});
    });

}

function addToPointLayer(id, headers) {
    let url = 'http://172.16.11.5:7474/db/data/ext/SpatialPlugin/graphdb/addNodeToLayer';
    let nodeLocation = "http://172.16.11.5:7474/db/data/node/" + id;
    let data = {layer: "geom", node: nodeLocation};
    request.post({url: url, form: data, headers: headers}, function (error, request, body) {
        if (error) {
            console.log('add point to layer ' + error);
            throw err
        }
        // console.log(body);
    });

}

app.get('/setup', function (req, res, next) {
    let url = 'http://172.16.11.5:7474/db/data/ext/SpatialPlugin/graphdb/addSimplePointLayer';
    let headers = {
        'Content-Type': 'application/json'
    };
    let data = {layer: "geom", lat: "lat", lon: "lon"};
    request.post({url: url, form: data, headers: headers}, function (error, request, body) {
        if (error) console.log(error);
        console.log(body);
    });
    res.end('Set GEO layer');
});


// readNodesWithLabel
