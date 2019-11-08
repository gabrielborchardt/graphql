const { ApolloServer, gql, PubSub } = require('apollo-server')
const Sequelize = require('./database')
const User = require('./models/user')
const Registered_Time = require('./models/registered_time')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const AuthDirective = require('./directives/auth')

const pubSub = new PubSub()

const typeDefs = gql`

    enum RoleEnum {
        ADMIN
        PROFESSIONAL
    }

    directive @auth(
        role: RoleEnum
    ) on OBJECT | FIELD_DEFINITION

    type User {
        id: ID! 
        name: String!
        email: String!
        password: String!
        role: RoleEnum
        registered_times: [Registered_Time]
    }

    type Registered_Time {
        id: ID!
        time_registered: String!
        user: User!
    }

    type Query {
        allUsers: [User]
        allRegisteredTimes: [Registered_Time]
    }

    type Mutation {
        createUser(data: CreateUserInput): User
        updateUser(id: ID! data: UpdateUserInput): User
        deleteUser(id: ID!): Boolean

        createTime(data: CreateTimeInput): Registered_Time @auth(role: PROFESSIONAL)
        updateTime(id: ID! data: UpdateTimeInput): Registered_Time @auth(role: ADMIN)
        deleteTime(id: ID!): Boolean @auth(role: ADMIN)

        signin(
            email: String!
            password: String!
        ): PayloadAuth
    }

    type PayloadAuth {
        token: String!
        user: User!
    }

    type Subscription {
        onCreatedUser: User
    }

    input CreateUserInput {
        name: String!
        email: String!
        password: String!
        role: RoleEnum!
    }

    input UpdateUserInput {
        name: String
        email: String
        password: String
        role: RoleEnum
    }

    input CreateTimeInput {
        time_registered: String!
        user: CreateUserInput
    }
    input UpdateTimeInput {
        time_registered: String!
    }
`

const resolver = {
    Query: {
        allUsers() {
            return User.findAll({ include: [Registered_Time] })
        },
        allRegisteredTimes(){
            return Registered_Time.findAll({ include: [User] })
        }
    },
    Mutation: {
        async createUser(parent, body, context, info) {
            body.data.password = await bcrypt.hash(body.data.password, 10)
            const user = await User.create(body.data)
            const reloadedUser = user.reload({ include: [Registered_Time] })
            pubSub.publish('createdUser', {
                onCreatedUser: reloadedUser
            })
            return reloadedUser
        },
        async updateUser(parent, body, context, info) {
            if (body.data.password) {
                body.data.password = await bcrypt.hash(body.data.password, 10)
            }
            const user = await User.findOne({
                where: { id: body.id }
            })
            if (!user) {
                throw new Error('Autor não encontrado')
            }
            const updateUser = await user.update(body.data)
            return updateUser
        },
        async deleteUser(parent, body, context, info) {
            const user = await User.findOne({
                where: { id: body.id }
            })
            await user.destroy()
            return true
        },
        async createTime(parent, body, context, info) {
            if (body.data.user) {
                const [createdUser, created] =
                    await User.findOrCreate(
                        { where: body.data.user }
                    )
                body.data.user = null
                const time = await Registered_Time.create(body.data)
                await time.setUser(createdUser.get('id'))
                const reloadedTime = time.reload({ include: [User] })
                pubSub.publish('CreatedTime', {
                    onCreatedTime: reloadedTime
                })
                return reloadedTime
            } else {
                return Registered_Time.create(body.data, { include: [User] })
            }
        },
        async updateTime(parent, body, context, info) {
            const time = await Registered_Time.findOne({
                where: { id: body.id }
            })
            if (!time) {
                throw new Error('Tempo não encontrado')
            }
            const updateTime = await time.update(body.data)
            return updateTime
        },
        async deleteTime(parent, body, context, info) {
            const time = await Registered_Time.findOne({
                where: { id: body.id }
            })
            await time.destroy()
            return true
        },
        async signin(parent, body, context, info) {
            const user = await User.findOne({
                where: { email: body.email }
            })

            if (user) {
                const isCorrect = await bcrypt.compare(
                    body.password,
                    user.password
                )
                if (!isCorrect) {
                    throw new Error('Senha inválida')
                }

                const token = jwt.sign({ id: user.id }, 'secret')

                return {
                    token,
                    user
                }
            }
        }    
    },
    Subscription: {
        onCreatedUser:{
            subscribe: () => pubSub.asyncIterator('createdUser')
        }
    }
}

const server = new ApolloServer({
    typeDefs: typeDefs,
    resolvers: resolver,
    schemaDirectives: {
        auth: AuthDirective
    },
    context({ req }) {
        return {
            headers: req.headers
        }
    }
});

Sequelize.sync().then(() => {
    server.listen()
        .then(() => {
            console.log('Servidor rodando')
        })
})