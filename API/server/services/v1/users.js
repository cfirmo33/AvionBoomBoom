module.exports = function (app, router) {
    var db = app.get("database");
    var config = app.get("config");
    var async = require("async");
    var redis = app.get("redis");
    var middlewares = require("../../utilities/middlewares.js")(app);
    var models = require("../../database/models.json");

    router.get("/", middlewares.all(models.user.public, 0, 25, 100, "user"), (req, res) => {
        async.parallel({
            users(cb) {
                db.User.findAll({
                    where: req.filter,
                    attributes: req.fields,
                    offset: req.pagination.offset,
                    limit: req.pagination.limit,
                    order: req.sort
                }).then((users) => {
                    cb(false, users);
                }).catch((err) => {
                    cb(err);
                });
            },
            count(cb) {
                db.User.count({
                    where: req.filter,
                }).then((count) => {
                    cb(false, count);
                }).catch((err) => {
                    cb(err);
                });
            }
        }, (err, results) => {
            if (err) {
                res.status(500).json({
                    error: "server_error",
                    error_description: "Internal server error"
                });
                return;
            }
            res.set("Content-Range", `${req.pagination.range}|${results.count}`);
            res.status((results.count == results.users.length) ? 200 : 206).json(results.users);
        });
    });

    router.get("/me", middlewares.isAuth, middlewares.fields(models.user.public.concat(models.user.private)), (req, res) => {
        db.User.findOne({
            where: {
                id: req.auth.id
            },
            attributes: req.fields
        }).then((user) => {
            if (user == null) {
                res.status(404).json({
                    error: "not_found",
                    error_description: `User with id '${req.auth.id}' doesn't exist`
                });
                return;
            }
            res.status(200).json(user);
        }).catch((err) => {
            res.status(500).json({
                error: "server_error",
                error_description: "Internal server error"
            });
        });
    });

    router.get("/count", (req, res) => {
        redis.get("users:count", (err, data) => {
            if (!err && data !== null) {
                res.status(200).json({
                    count: data
                });
                return;
            }
            db.User.count().then((count) => {
                redis.setex("users:count", 30, count);
                res.status(200).json({
                    count: count
                });
            }).catch((err) => {
                res.status(500).json({
                    error: "server_error",
                    error_description: "Internal server error"
                });
            });
        });
    });

    router.get("/online", (req, res) => {
        redis.get("users:online", (err, data) => {
            if (!err && data !== null) {
                res.status(200).json({
                    online: data
                });
                return;
            }
            db.User.count({
                where: {
                    lastAction: {
                        $gt: new Date(new Date() - 5 * 60 * 1000)
                    }
                }
            }).then((online) => {
                redis.setex("users:online", 30, online);
                res.status(200).json({
                    online: online
                });
            }).catch((err) => {
                res.status(500).json({
                    error: "server_error",
                    error_description: "Internal server error"
                });
            });
        });
    });

    router.get("/:id", middlewares.fields(models.user.public), (req, res) => {
        db.User.findOne({
            where: {
                id: req.params.id
            },
            attributes: req.fields
        }).then((user) => {
            if (user == null) {
                res.status(404).json({
                    error: "not_found",
                    error_description: `User with id '${req.params.id}' doesn't exist`
                });
                return;
            }
            res.status(200).json(user);
        }).catch((err) => {
            res.status(500).json({
                error: "server_error",
                error_description: err
            });
        });
    });

    router.get("/:id/matchs", middlewares.all(models.match.public, 0, 25, 100, "user"), (req, res) => {
        db.User.findOne({
            where: {
                id: req.params.id
            },
        }).then((user) => {
            if (user == null) {
                res.status(404).json({
                    error: "not_found",
                    error_description: `User with id '${req.params.id}' doesn't exist`
                });
                return;
            }

            async.parallel({
                matchs(cb) {
                    user.getMatches({
                        where: req.filter,
                        attributes: req.fields,
                        offset: req.pagination.offset,
                        limit: req.pagination.limit,
                        order: req.sort,
                        include: [{
                                model: db.User,
                                attributes: models.user.public
                            },
                            {
                                model: db.Map,
                                attributes: ["id", "name", "type", "playable", "difficulty"]
                            }
                        ]
                    }).then((matchs) => {
                        cb(false, matchs);
                    }).catch((err) => {
                        cb(err);
                    });
                },
                count(cb) {
                    user.getMatches({
                        where: req.filter
                    }).then((matchs) => {
                        cb(false, matchs.length);
                    }).catch((err) => {
                        cb(err);
                    });
                }
            }, (err, results) => {
                if (err) {
                    res.status(500).json({
                        error: "server_error",
                        error_description: "Internal server error"
                    });
                    return;
                }
                res.set("Content-Range", `${req.pagination.range}|${results.count}`);
                res.status((results.count == results.matchs.length) ? 200 : 206).json(results.matchs);
            });

        }).catch((err) => {
            res.status(500).json({
                error: "server_error",
                error_description: err
            });
        });
    });

    router.get("/:id/ranking", (req, res) => {
        db.User.findOne({
            where: {
                id: req.params.id
            },
        }).then((user) => {
            if (user == null) {
                res.status(404).json({
                    error: "not_found",
                    error_description: `User with id '${req.params.id}' doesn't exist`
                });
                return;
            }

            db.User.count({
                where: {
                    elo: {
                        $gt: user.elo
                    }
                }
            }).then((rank) => {
                res.status(200).json({
                    ranking: rank + 1
                });
            }).catch((err) => {
                res.status(500).json({
                    error: "server_error",
                    error_description: err
                });
            });
        }).catch((err) => {
            res.status(500).json({
                error: "server_error",
                error_description: err
            });
        });
    });
}