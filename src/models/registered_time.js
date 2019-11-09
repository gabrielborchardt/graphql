const { Model, DataTypes } = require('sequelize')
const Sequelize = require('../database')
const User = require('./user')

class Registerd_Time extends Model {
    static associate() {
        User.hasMany(Registerd_Time)
        Registerd_Time.belongsTo(User)
    }
}

Registerd_Time.init({
    date_registered: DataTypes.STRING,
    time_registered: DataTypes.STRING
}, { sequelize: Sequelize, modelName: 'registerd_time' })

Registerd_Time.associate()

module.exports = Registerd_Time