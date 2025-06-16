package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/oschwald/geoip2-golang"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type Restriction struct {
	ID        int64  `gorm:"primaryKey"`
	Category  string `gorm:"type:CATEGORIES;not null"`
	Scope     string `gorm:"type:SCOPES;not null"`
	Value     string `gorm:"type:varchar(64);not null"`
	Code      *int
	State     string    `gorm:"type:state;not null;default:'enabled'"`
	CreatedAt time.Time `gorm:"not null"`
	UpdatedAt time.Time `gorm:"not null"`
}

type RestrictionResponse struct {
	Restricted bool   `json:"restricted"`
	Category   string `json:"category"`
	Scope      string `json:"scope"`
}

func main() {

	db, err := gorm.Open(postgres.Open("host=localhost user=postgres password=postgres dbname=app port=5432 sslmode=disable"), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	db.Exec(`CREATE TYPE CATEGORIES AS ENUM ('whitelist', 'maintenance', 'blacklist', 'blocklogin')`)
	db.Exec(`CREATE TYPE SCOPES AS ENUM ('continent', 'country', 'ip', 'ip_subnet', 'all')`)
	db.AutoMigrate(&Restriction{})

	redisClient := redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
	})

	geoDB, err := geoip2.Open("GeoLite2-City.mmdb")
	if err != nil {
		log.Fatal("Failed to open GeoIP database:", err)
	}
	defer geoDB.Close()

	r := gin.Default()

	r.GET("/check-restriction", func(c *gin.Context) {

		userIP := c.GetHeader("X-Forwarded-For")
		if userIP == "" {
			userIP = c.ClientIP()
		}

		ip := net.ParseIP(userIP)
		if ip == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid IP address"})
			return
		}

		cacheKey := fmt.Sprintf("ip:%s", userIP)
		ctx := c.Request.Context()
		cached, err := redisClient.Get(ctx, cacheKey).Result()
		if err == nil {

			var resp RestrictionResponse
			if err := json.Unmarshal([]byte(cached), &resp); err == nil {
				c.JSON(http.StatusOK, resp)
				return
			}
		}

		record, err := geoDB.City(ip)
		if err != nil {
			log.Println("GeoIP lookup failed:", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "GeoIP lookup failed"})
			return
		}
		country := record.Country.IsoCode
		continent := record.Continent.Code

		// Query restrictions (order by specificity: ip > ip_subnet > country > continent > all)
		var restriction Restriction
		query := db.Where("state = ?", "enabled").Order("CASE scope WHEN 'ip' THEN 1 WHEN 'ip_subnet' THEN 2 WHEN 'country' THEN 3 WHEN 'continent' THEN 4 WHEN 'all' THEN 5 END")
		if err := query.Where("scope = ? AND value = ?", "ip", userIP).Or("scope = ? AND value = ?", "country", country).Or("scope = ? AND value = ?", "continent", continent).Or("scope = ?", "all").First(&restriction).Error; err == nil {
			resp := RestrictionResponse{
				Restricted: true,
				Category:   restriction.Category,
				Scope:      restriction.Scope,
			}

			respJSON, _ := json.Marshal(resp)
			redisClient.Set(ctx, cacheKey, respJSON, 5*time.Minute)

			c.JSON(http.StatusOK, resp)
			return
		}

		var restrictions []Restriction
		if err := db.Where("scope = ? AND state = ?", "ip_subnet", "enabled").Find(&restrictions).Error; err == nil {
			for _, r := range restrictions {
				_, subnet, err := net.ParseCIDR(r.Value)
				if err == nil && subnet.Contains(ip) {
					resp := RestrictionResponse{
						Restricted: true,
						Category:   r.Category,
						Scope:      r.Scope,
					}
					respJSON, _ := json.Marshal(resp)
					redisClient.Set(ctx, cacheKey, respJSON, 5*time.Minute)
					c.JSON(http.StatusOK, resp)
					return
				}
			}
		}

		resp := RestrictionResponse{
			Restricted: false,
			Category:   "",
			Scope:      "",
		}
		respJSON, _ := json.Marshal(resp)
		redisClient.Set(ctx, cacheKey, respJSON, 5*time.Minute)
		c.JSON(http.StatusOK, resp)
	})

	r.Run(":8080")
}
